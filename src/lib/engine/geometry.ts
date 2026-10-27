import type { CropRect, Geometry } from "@/lib/editor/types";
import { type Affine, chain, rotate, scale, translate } from "./affine";

/*
 * Spații de coordonate:
 *  - sursă UV: imaginea încărcată (0..1, y în jos)
 *  - orientat: după rotiri de 90° și oglindiri, dimensiuni W×H
 *  - cadru ("frame"): imaginea orientată rotită cu `angle` și scalată
 *    cât să acopere complet dreptunghiul W×H (fără colțuri goale)
 *  - crop: dreptunghi normalizat în cadru
 */

export function orientedSize(w: number, h: number, rotation: number): [number, number] {
  return rotation % 2 === 1 ? [h, w] : [w, h];
}

/** Factorul de scalare pentru ca imaginea rotită să acopere cadrul. */
export function coverScale(w: number, h: number, angleDeg: number): number {
  const t = Math.abs((angleDeg * Math.PI) / 180);
  return Math.cos(t) + Math.max(w / h, h / w) * Math.sin(t);
}

/** Cadru UV → sursă UV. */
export function frameToSource(srcW: number, srcH: number, g: Geometry): Affine {
  const [W, H] = orientedSize(srcW, srcH, g.rotation);
  const s = coverScale(W, H, g.angle);
  const steps: Affine[] = [
    scale(W, H),
    translate(-W / 2, -H / 2),
    scale(1 / s),
    rotate((-g.angle * Math.PI) / 180),
    translate(W / 2, H / 2),
    scale(1 / W, 1 / H),
  ];
  if (g.flipH) steps.push([-1, 0, 0, 1, 1, 0]);
  if (g.flipV) steps.push([1, 0, 0, -1, 0, 1]);
  // inversul unei rotiri de 90° în sens orar: (u, v) → (v, 1 - u)
  for (let i = 0; i < g.rotation; i++) steps.push([0, -1, 1, 0, 0, 1]);
  return chain(...steps);
}

/** Conținut afișat UV → cadru UV (în modul crop se afișează tot cadrul). */
export function contentToFrame(g: Geometry, showFullFrame: boolean): Affine {
  if (showFullFrame) return [1, 0, 0, 1, 0, 0];
  const c = g.crop;
  return [c.w, 0, 0, c.h, c.x, c.y];
}

/** Dimensiunea conținutului afișat, în pixeli ai imaginii originale. */
export function contentSize(srcW: number, srcH: number, g: Geometry, showFullFrame: boolean): [number, number] {
  const [W, H] = orientedSize(srcW, srcH, g.rotation);
  if (showFullFrame) return [W, H];
  return [Math.max(1, g.crop.w * W), Math.max(1, g.crop.h * H)];
}

/** Câți pixeli de cadru corespund unui pixel sursă (factor uniform). */
export function sourceToFramePixelScale(srcW: number, srcH: number, g: Geometry): number {
  const [W, H] = orientedSize(srcW, srcH, g.rotation);
  return coverScale(W, H, g.angle);
}

export function clampCrop(c: CropRect, min = 0.02): CropRect {
  const w = Math.min(1, Math.max(min, c.w));
  const h = Math.min(1, Math.max(min, c.h));
  const x = Math.min(1 - w, Math.max(0, c.x));
  const y = Math.min(1 - h, Math.max(0, c.y));
  return { x, y, w, h };
}

/** Cel mai mare dreptunghi cu proporția dată, centrat cât mai aproape de `center`. */
export function fitAspect(
  aspect: number,
  frameW: number,
  frameH: number,
  center: [number, number] = [0.5, 0.5],
): CropRect {
  let wPx = frameW;
  let hPx = frameW / aspect;
  if (hPx > frameH) {
    hPx = frameH;
    wPx = frameH * aspect;
  }
  const w = wPx / frameW;
  const h = hPx / frameH;
  return clampCrop({ x: center[0] - w / 2, y: center[1] - h / 2, w, h }, 0);
}

/** Rotire la 90° în sens orar a întregii imagini, cu păstrarea crop-ului. */
export function rotateGeometryCW(g: Geometry): Geometry {
  const c = g.crop;
  const oneFlip = g.flipH !== g.flipV;
  const rotation = (((g.rotation + (oneFlip ? 3 : 1)) % 4) as Geometry["rotation"]);
  return {
    ...g,
    rotation,
    crop: { x: 1 - (c.y + c.h), y: c.x, w: c.h, h: c.w },
    aspect: g.aspect ? 1 / g.aspect : null,
  };
}

export function rotateGeometryCCW(g: Geometry): Geometry {
  return rotateGeometryCW(rotateGeometryCW(rotateGeometryCW(g)));
}

export function flipGeometry(g: Geometry, axis: "h" | "v"): Geometry {
  const c = g.crop;
  if (axis === "h") {
    return { ...g, flipH: !g.flipH, angle: -g.angle, crop: { ...c, x: 1 - c.x - c.w } };
  }
  return { ...g, flipV: !g.flipV, angle: -g.angle, crop: { ...c, y: 1 - c.y - c.h } };
}
