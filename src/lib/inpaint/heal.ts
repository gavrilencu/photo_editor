import { createCanvas, editorDoc, type HealPatch } from "@/lib/editor/document";
import type { Stroke } from "@/lib/editor/types";

/** Numărul maxim de pixeli procesați de algoritm (restul se face la scară redusă). */
const MAX_WORK_PIXELS = 2_000_000;

let worker: Worker | null = null;
let nextId = 1;

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./inpaint.worker.ts", import.meta.url), { type: "module" });
  } catch {
    worker = null;
  }
  return worker;
}

function runInpaint(
  width: number,
  height: number,
  data: Uint8ClampedArray,
  mask: Uint8Array,
  onProgress?: (p: number) => void,
): Promise<Uint8ClampedArray> {
  const w = getWorker();
  if (!w) {
    // rezervă: rulează pe firul principal
    return import("./patchmatch").then(({ inpaint }) => inpaint(width, height, data, mask, { onProgress }));
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent) => {
      const msg = e.data as { id: number; data?: Uint8ClampedArray; error?: string; progress?: number };
      if (msg.id !== id) return;
      if (msg.progress !== undefined) {
        onProgress?.(msg.progress);
        return;
      }
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      if (msg.error) reject(new Error(msg.error));
      else resolve(msg.data!);
    };
    const onError = (e: ErrorEvent) => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      worker?.terminate();
      worker = null;
      reject(new Error(e.message || "Eroare în worker."));
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    w.postMessage({ id, width, height, data, mask }, [data.buffer, mask.buffer]);
  });
}

/** Desenează traseele pensulei (alb pe negru) într-un canvas. */
function rasterize(strokes: Stroke[], ox: number, oy: number, k: number, w: number, h: number, extra: number): Uint8ClampedArray {
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of strokes) {
    const r = (s.radius + extra) * k;
    if (s.points.length === 1) {
      const [x, y] = s.points[0];
      ctx.beginPath();
      ctx.arc((x - ox) * k, (y - oy) * k, r, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.lineWidth = r * 2;
    ctx.beginPath();
    s.points.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo((x - ox) * k, (y - oy) * k);
      else ctx.lineTo((x - ox) * k, (y - oy) * k);
    });
    ctx.stroke();
  }
  return ctx.getImageData(0, 0, w, h).data;
}

/** Blur box separabil pe un canal (pentru marginea moale a măștii). */
function boxBlur(src: Float32Array<ArrayBuffer>, w: number, h: number, r: number): Float32Array<ArrayBuffer> {
  if (r < 1) return src;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const norm = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc * norm;
      acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc * norm;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/**
 * Elimină zona pictată: reconstruiește pixelii din imaginea originală
 * (rezoluție completă) și întoarce petecul aplicat, pentru undo/redo.
 */
export async function healStrokes(strokes: Stroke[], onProgress?: (p: number) => void): Promise<HealPatch | null> {
  const doc = editorDoc;
  if (!doc.original || strokes.length === 0) return null;
  const W = doc.width;
  const H = doc.height;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of strokes) {
    for (const [x, y] of s.points) {
      minX = Math.min(minX, x - s.radius);
      minY = Math.min(minY, y - s.radius);
      maxX = Math.max(maxX, x + s.radius);
      maxY = Math.max(maxY, y + s.radius);
    }
  }
  minX = Math.max(0, Math.floor(minX - 4));
  minY = Math.max(0, Math.floor(minY - 4));
  maxX = Math.min(W, Math.ceil(maxX + 4));
  maxY = Math.min(H, Math.ceil(maxY + 4));
  if (maxX <= minX || maxY <= minY) return null;

  // regiunea de lucru: zona + o margine din care se copiază textura
  const bw = maxX - minX;
  const bh = maxY - minY;
  const margin = Math.round(Math.max(64, Math.max(bw, bh) * 0.9));
  const rx = Math.max(0, minX - margin);
  const ry = Math.max(0, minY - margin);
  const rw = Math.min(W, maxX + margin) - rx;
  const rh = Math.min(H, maxY + margin) - ry;

  const k = Math.min(1, Math.sqrt(MAX_WORK_PIXELS / (rw * rh)));
  const ww = Math.max(1, Math.round(rw * k));
  const wh = Math.max(1, Math.round(rh * k));
  const ks = ww / rw;

  const work = createCanvas(ww, wh);
  const wctx = work.getContext("2d", { willReadFrequently: true })!;
  wctx.imageSmoothingQuality = "high";
  wctx.drawImage(doc.original, rx, ry, rw, rh, 0, 0, ww, wh);
  const workData = wctx.getImageData(0, 0, ww, wh);

  // masca la scara de lucru (ușor dilatată ca să prindă marginea obiectului)
  const m = rasterize(strokes, rx, ry, ks, ww, wh, 2 / ks);
  const mask = new Uint8Array(ww * wh);
  for (let i = 0; i < mask.length; i++) mask[i] = m[i * 4] > 0 ? 1 : 0;

  const filled = await runInpaint(ww, wh, workData.data, mask, onProgress);

  // pixelii reconstruiți, la rezoluția regiunii
  let full: Uint8ClampedArray;
  if (ks < 1) {
    wctx.putImageData(new ImageData(new Uint8ClampedArray(filled), ww, wh), 0, 0);
    const up = createCanvas(rw, rh);
    const uctx = up.getContext("2d", { willReadFrequently: true })!;
    uctx.imageSmoothingQuality = "high";
    uctx.drawImage(work, 0, 0, ww, wh, 0, 0, rw, rh);
    full = uctx.getImageData(0, 0, rw, rh).data;
  } else {
    full = filled;
  }

  // mască moale la rezoluție completă, limitată la zona efectivă
  const feather = Math.max(1, Math.round(1.5 / ks));
  const px = Math.max(rx, minX - feather * 2 - Math.ceil(2 / ks));
  const py = Math.max(ry, minY - feather * 2 - Math.ceil(2 / ks));
  const pw = Math.min(rx + rw, maxX + feather * 2 + Math.ceil(2 / ks)) - px;
  const ph = Math.min(ry + rh, maxY + feather * 2 + Math.ceil(2 / ks)) - py;
  const sm = rasterize(strokes, px, py, 1, pw, ph, 2 / ks);
  let soft = new Float32Array(pw * ph);
  for (let i = 0; i < soft.length; i++) soft[i] = sm[i * 4] / 255;
  soft = boxBlur(soft, pw, ph, feather);

  const ctx = doc.context();
  const before = ctx.getImageData(px, py, pw, ph);
  const after = new ImageData(pw, ph);
  const b = before.data;
  const a = after.data;
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const i = (y * pw + x) * 4;
      const fi = ((y + py - ry) * rw + (x + px - rx)) * 4;
      const t = Math.min(1, soft[y * pw + x] * 1.6);
      a[i] = b[i] + (full[fi] - b[i]) * t;
      a[i + 1] = b[i + 1] + (full[fi + 1] - b[i + 1]) * t;
      a[i + 2] = b[i + 2] + (full[fi + 2] - b[i + 2]) * t;
      a[i + 3] = 255;
    }
  }
  ctx.putImageData(after, px, py);
  return { x: px, y: py, before, after };
}
