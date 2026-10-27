/**
 * Documentul curent: pixelii originali (rezoluție completă), proxy-ul de
 * previzualizare și petecele de retuș (pentru undo/redo). Datele mari
 * stau aici, în afara store-ului React.
 */

export interface HealPatch {
  x: number;
  y: number;
  before: ImageData;
  after: ImageData;
}

const isCoarse = () => typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

export function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponibil.");
  return ctx;
}

/** Micșorare de calitate: înjumătățiri succesive, apoi pasul final. */
export function downscale(src: CanvasImageSource & { width: number; height: number }, maxSide: number): HTMLCanvasElement {
  const w0 = src.width;
  const h0 = src.height;
  const k = Math.min(1, maxSide / Math.max(w0, h0));
  const tw = Math.max(1, Math.round(w0 * k));
  const th = Math.max(1, Math.round(h0 * k));
  let cur: CanvasImageSource = src;
  let cw = w0;
  let ch = h0;
  while (cw / 2 >= tw && ch / 2 >= th) {
    const nw = Math.round(cw / 2);
    const nh = Math.round(ch / 2);
    const c = createCanvas(nw, nh);
    const ctx = ctx2d(c);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cur, 0, 0, cw, ch, 0, 0, nw, nh);
    cur = c;
    cw = nw;
    ch = nh;
  }
  const out = createCanvas(tw, th);
  const ctx = ctx2d(out);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(cur, 0, 0, cw, ch, 0, 0, tw, th);
  return out;
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

class EditorDocument {
  original: HTMLCanvasElement | null = null;
  proxy: HTMLCanvasElement | null = null;
  thumbSource: HTMLCanvasElement | null = null;
  width = 0;
  height = 0;
  name = "imagine";
  patches: HealPatch[] = [];
  applied = 0;

  /** Limitele de dimensiune depind de dispozitiv (memorie / texturi GPU). */
  limits(maxTextureSize: number) {
    const coarse = isCoarse();
    return {
      maxSide: Math.min(maxTextureSize || 4096, 16384),
      maxPixels: coarse ? 16_000_000 : 50_000_000,
      proxySide: Math.min(maxTextureSize || 4096, coarse ? 2048 : 3072),
    };
  }

  async load(file: Blob, name: string, maxTextureSize: number) {
    const img = await decode(file);
    const w0 = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
    const h0 = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
    if (!w0 || !h0) throw new Error("Imaginea nu a putut fi citită.");

    const { maxSide, maxPixels, proxySide } = this.limits(maxTextureSize);
    const k = Math.min(1, maxSide / Math.max(w0, h0), Math.sqrt(maxPixels / (w0 * h0)));
    const w = Math.max(1, Math.round(w0 * k));
    const h = Math.max(1, Math.round(h0 * k));

    // desenare directă la dimensiunea țintă: evită un canvas intermediar uriaș
    // (pe iOS canvas-urile foarte mari eșuează)
    const original = createCanvas(w, h);
    const c = ctx2d(original);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
    c.drawImage(img, 0, 0, w, h);
    if ("close" in img) img.close();

    this.original = original;
    this.width = original.width;
    this.height = original.height;
    this.name = name.replace(/\.[^.]+$/, "") || "imagine";
    this.patches = [];
    this.applied = 0;
    this.rebuildProxy(proxySide);
    return { width: this.width, height: this.height, scaled: k < 1, originalWidth: w0, originalHeight: h0 };
  }

  private proxySide = 3072;

  rebuildProxy(side = this.proxySide) {
    if (!this.original) return;
    this.proxySide = side;
    this.proxy = downscale(this.original, side);
    this.thumbSource = downscale(this.proxy, 220);
  }

  context(): CanvasRenderingContext2D {
    if (!this.original) throw new Error("Nicio imagine încărcată.");
    return ctx2d(this.original);
  }

  /** Adaugă un petec nou (renunță la cele anulate). */
  addPatch(p: HealPatch) {
    this.patches.length = this.applied;
    this.patches.push(p);
    this.applied = this.patches.length;
  }

  /** Aduce pixelii la exact `count` petece aplicate (undo/redo). */
  syncHeal(count: number): boolean {
    if (!this.original) return false;
    const target = Math.max(0, Math.min(count, this.patches.length));
    if (target === this.applied) return false;
    const ctx = this.context();
    while (this.applied < target) {
      const p = this.patches[this.applied++];
      ctx.putImageData(p.after, p.x, p.y);
    }
    while (this.applied > target) {
      const p = this.patches[--this.applied];
      ctx.putImageData(p.before, p.x, p.y);
    }
    this.rebuildProxy();
    return true;
  }
}

export const editorDoc = new EditorDocument();
