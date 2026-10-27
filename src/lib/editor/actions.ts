import { getRenderer, webglInfo } from "@/lib/engine/instance";
import { lutRegistry, parseCube } from "@/lib/engine/lut";
import { healStrokes } from "@/lib/inpaint/heal";
import { DEFAULT_ADJ, DEFAULT_EDIT } from "./defaults";
import { createCanvas, editorDoc } from "./document";
import { applyPreset, PRESETS } from "./presets";
import { useEditor } from "./store";
import type { EditState } from "./types";
import { finalOutputBase, finalSize } from "./view";

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?)$/i;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Deschide un selector de fișiere (trebuie apelat direct dintr-un click). */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    input.addEventListener("change", () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    input.addEventListener("cancel", () => {
      resolve(null);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

export async function openImageFile(file: File) {
  const st = useEditor.getState();
  if (!file.type.startsWith("image/") && !IMAGE_EXT.test(file.name)) {
    st.showToast("Fișierul ales nu este o imagine.");
    return;
  }
  const info = webglInfo();
  if (!info.ok) {
    st.showToast("Browserul nu suportă WebGL2 — editorul nu poate rula.");
    return;
  }
  st.set({ busy: "Se încarcă imaginea…" });
  try {
    const res = await editorDoc.load(file, file.name, info.maxTextureSize);
    useEditor.getState().loadImage({ name: editorDoc.name, width: res.width, height: res.height });
    if (res.scaled) {
      st.showToast(
        `Imagine mare (${res.originalWidth}×${res.originalHeight}) — redusă la ${res.width}×${res.height} pentru acest dispozitiv.`,
      );
    }
  } catch (e) {
    st.showToast(`Nu am putut deschide imaginea: ${errMsg(e)}`);
  } finally {
    useEditor.getState().set({ busy: null });
  }
}

export async function promptOpenImage() {
  const file = await pickFile("image/*");
  if (file) await openImageFile(file);
}

// ------------------------------------------------------------------ retuș

export async function applyHeal() {
  const st = useEditor.getState();
  const strokes = st.strokes;
  if (!strokes.length || st.busy) return;
  st.set({ busy: "Se elimină obiectul…" });
  try {
    editorDoc.syncHeal(st.edit.healCount);
    const patch = await healStrokes(strokes, (p) => {
      useEditor.getState().set({ busy: `Se elimină obiectul… ${Math.round(p * 100)}%` });
    });
    if (patch) {
      editorDoc.addPatch(patch);
      editorDoc.rebuildProxy();
      const s = useEditor.getState();
      s.apply((e) => ({ ...e, healCount: editorDoc.applied }));
      s.bumpImageVersion();
    }
    useEditor.getState().set({ strokes: [] });
  } catch (e) {
    useEditor.getState().showToast(`Eliminarea a eșuat: ${errMsg(e)}`);
  } finally {
    useEditor.getState().set({ busy: null });
  }
}

// ------------------------------------------------------------------ export

export type ExportFormat = "image/jpeg" | "image/png" | "image/webp";

export interface ExportResult {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function exportImage(format: ExportFormat, quality: number, scale: number): Promise<ExportResult> {
  const r = getRenderer();
  const doc = editorDoc;
  if (!r || !doc.original) throw new Error("Nicio imagine de exportat.");
  const { edit } = useEditor.getState();
  const [fw, fh] = finalSize(doc.width, doc.height, edit.geometry);
  const outW = Math.max(1, Math.round(fw * scale));
  const outH = Math.max(1, Math.round(fh * scale));
  const px = r.exportPixels(doc.original, doc.width, doc.height, edit, outW, outH, finalOutputBase(doc.width, doc.height, edit.geometry));
  const canvas = createCanvas(outW, outH);
  canvas.getContext("2d")!.putImageData(new ImageData(px, outW, outH), 0, 0);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, format, quality));
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error("Browserul nu a putut codifica imaginea.");
  const ext = EXT[blob.type] ?? "png";
  return { blob, filename: `${doc.name}-editat.${ext}`, width: outW, height: outH };
}

// ------------------------------------------------------------------ miniaturi & auto

function variantSize(maxSide: number): { w: number; h: number; g: EditState["geometry"] } | null {
  const doc = editorDoc;
  const src = doc.thumbSource;
  if (!src) return null;
  const g = useEditor.getState().edit.geometry;
  const [fw, fh] = finalSize(src.width, src.height, g);
  const k = maxSide / Math.max(fw, fh);
  return { w: Math.max(1, Math.round(fw * k)), h: Math.max(1, Math.round(fh * k)), g };
}

function renderVariants(edits: EditState[], maxSide: number): { pixels: Uint8ClampedArray<ArrayBuffer>[]; w: number; h: number } | null {
  const r = getRenderer();
  const src = editorDoc.thumbSource;
  const size = variantSize(maxSide);
  const image = useEditor.getState().image;
  if (!r || !src || !size || !image) return null;
  const pixels = r.renderVariants(
    `v${image.version}`,
    src,
    src.width,
    src.height,
    edits,
    size.w,
    size.h,
    finalOutputBase(src.width, src.height, size.g),
  );
  return { pixels, w: size.w, h: size.h };
}

export interface PresetThumb {
  id: string | null;
  name: string;
  url: string;
}

export function renderPresetThumbs(): PresetThumb[] {
  const g = useEditor.getState().edit.geometry;
  const base: EditState = { ...DEFAULT_EDIT, geometry: g };
  const list = [{ id: null, name: "Original" }, ...PRESETS.map((p) => ({ id: p.id, name: p.name }))];
  const edits = [base, ...PRESETS.map((p) => applyPreset(base, p, 100))];
  const res = renderVariants(edits, 160);
  if (!res) return [];
  const c = createCanvas(res.w, res.h);
  const ctx = c.getContext("2d")!;
  return res.pixels.map((px, i) => {
    ctx.putImageData(new ImageData(px, res.w, res.h), 0, 0);
    return { ...list[i], url: c.toDataURL("image/jpeg", 0.82) };
  });
}

const toLin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Îmbunătățire automată pe baza histogramei imaginii neajustate. */
export function autoEnhance() {
  const st = useEditor.getState();
  const neutral: EditState = { ...DEFAULT_EDIT, geometry: st.edit.geometry };
  const res = renderVariants([neutral], 256);
  if (!res) return;
  const px = res.pixels[0];
  const hist = new Uint32Array(256);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < px.length; i += 4) {
    const l = Math.round(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]);
    hist[l]++;
    sum += l;
    n++;
  }
  const pct = (q: number) => {
    let acc = 0;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= q * n) return i / 255;
    }
    return 1;
  };
  const mean = sum / n / 255;
  const lo = pct(0.005);
  const hi = pct(0.995);
  let dark = 0;
  let bright = 0;
  for (let i = 0; i < 40; i++) dark += hist[i];
  for (let i = 230; i < 256; i++) bright += hist[i];
  dark /= n;
  bright /= n;
  let variance = 0;
  for (let i = 0; i < 256; i++) variance += hist[i] * (i / 255 - mean) ** 2;
  const std = Math.sqrt(variance / n);

  const exposure = clamp(Math.log2(toLin(0.46) / Math.max(1e-3, toLin(mean))) * 0.55, -1.5, 1.5);
  const adj = {
    ...DEFAULT_ADJ,
    ...st.edit.adj,
    exposure: Math.round(exposure * 100) / 100,
    contrast: Math.round(clamp((0.24 - std) * 180, -10, 30)),
    highlights: Math.round(-clamp(bright * 250 + (hi > 0.97 ? 15 : 0), 0, 60)),
    shadows: Math.round(clamp(dark * 180 + 5, 0, 55)),
    whites: Math.round(clamp((0.97 - hi) * 160, -20, 40)),
    blacks: Math.round(-clamp((lo - 0.015) * 260, -10, 35)),
    vibrance: Math.max(st.edit.adj.vibrance, 18),
  };
  st.apply((e) => ({ ...e, adj }));
  st.showToast("Ajustări automate aplicate.");
}

// ------------------------------------------------------------------ LUT

export async function importLut() {
  const file = await pickFile(".cube");
  if (!file) return;
  const st = useEditor.getState();
  try {
    const lut = parseCube(await file.text(), file.name);
    lutRegistry.set(lut.id, lut);
    st.set({ luts: [...st.luts, { id: lut.id, name: lut.name }] });
    st.apply((e) => ({ ...e, lut: { id: lut.id, amount: 100 } }));
    st.showToast(`LUT „${lut.name}” importat (${lut.size}³).`);
  } catch (e) {
    st.showToast(`LUT invalid: ${errMsg(e)}`);
  }
}

// ------------------------------------------------------------------ salvare

export async function shareFile(res: ExportResult): Promise<boolean> {
  const file = new File([res.blob], res.filename, { type: res.blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: res.filename });
      return true;
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return true;
    }
  }
  return false;
}

export function downloadFile(res: ExportResult) {
  const url = URL.createObjectURL(res.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = res.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
