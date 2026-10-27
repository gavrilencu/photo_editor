import { type Affine, chain, invert, scale } from "@/lib/engine/affine";
import { contentSize, contentToFrame, frameToSource, orientedSize, sourceToFramePixelScale } from "@/lib/engine/geometry";
import type { OutputParams } from "@/lib/engine/renderer";
import type { Geometry } from "./types";

export interface ViewState {
  zoom: number;
  /** Deplasare în pixeli CSS. */
  panX: number;
  panY: number;
}

export interface Layout {
  /** pixeli CSS per pixel de conținut */
  scale: number;
  fit: number;
  originX: number;
  originY: number;
  contentW: number;
  contentH: number;
}

export function computeLayout(
  cssW: number,
  cssH: number,
  contentW: number,
  contentH: number,
  view: ViewState,
  pad: number,
): Layout {
  const fit = Math.max(1e-6, Math.min((cssW - 2 * pad) / contentW, (cssH - 2 * pad) / contentH));
  const s = fit * view.zoom;
  return {
    scale: s,
    fit,
    originX: cssW / 2 + view.panX - (contentW * s) / 2,
    originY: cssH / 2 + view.panY - (contentH * s) / 2,
    contentW,
    contentH,
  };
}

export interface SceneInput {
  cssW: number;
  cssH: number;
  srcW: number;
  srcH: number;
  geometry: Geometry;
  cropMode: boolean;
  view: ViewState;
  pad: number;
}

export interface Scene {
  layout: Layout;
  /** Parametrii comuni (fără matricea pixel→conținut și fără split). */
  base: Omit<OutputParams, "pxToContent" | "split">;
  /** Pixeli CSS ai viewport-ului → pixeli ai imaginii sursă. */
  cssToSource: Affine;
  sourceToCss: Affine;
  /** Câți pixeli CSS are un pixel sursă. */
  cssPerSourcePx: number;
}

export function buildScene(i: SceneInput): Scene {
  const [cw, ch] = contentSize(i.srcW, i.srcH, i.geometry, i.cropMode);
  const layout = computeLayout(i.cssW, i.cssH, cw, ch, i.view, i.pad);
  const c2f = contentToFrame(i.geometry, i.cropMode);
  const f2s = frameToSource(i.srcW, i.srcH, i.geometry);
  const [W, H] = orientedSize(i.srcW, i.srcH, i.geometry.rotation);
  const s = layout.scale;
  const cssToContent: Affine = [1 / (cw * s), 0, 0, 1 / (ch * s), -layout.originX / (cw * s), -layout.originY / (ch * s)];
  const cssToSource = chain(cssToContent, c2f, f2s, scale(i.srcW, i.srcH));
  return {
    layout,
    base: {
      contentToFrame: c2f,
      frameToSource: f2s,
      crop: i.geometry.crop,
      cropPx: [i.geometry.crop.w * W, i.geometry.crop.h * H],
      effects: !i.cropMode,
    },
    cssToSource,
    sourceToCss: invert(cssToSource),
    cssPerSourcePx: s * sourceToFramePixelScale(i.srcW, i.srcH, i.geometry),
  };
}

/** Matricea gl_FragCoord (pixeli dispozitiv, y în sus) → conținut UV. */
export function devicePxToContent(layout: Layout, canvasW: number, canvasH: number, cssW: number, cssH: number): Affine {
  const dx = canvasW / cssW;
  const dy = canvasH / cssH;
  const sx = layout.contentW * layout.scale;
  const sy = layout.contentH * layout.scale;
  return [1 / (dx * sx), 0, 0, -1 / (dy * sy), -layout.originX / sx, (canvasH / dy - layout.originY) / sy];
}

/** Parametri de ieșire pentru imaginea finală (crop aplicat), ex. export. */
export function finalOutputBase(srcW: number, srcH: number, g: Geometry): Omit<OutputParams, "pxToContent" | "split"> {
  const [W, H] = orientedSize(srcW, srcH, g.rotation);
  return {
    contentToFrame: contentToFrame(g, false),
    frameToSource: frameToSource(srcW, srcH, g),
    crop: g.crop,
    cropPx: [g.crop.w * W, g.crop.h * H],
    effects: true,
  };
}

/** Dimensiunile finale (după crop) în pixeli ai imaginii originale. */
export function finalSize(srcW: number, srcH: number, g: Geometry): [number, number] {
  const [W, H] = orientedSize(srcW, srcH, g.rotation);
  return [Math.max(1, Math.round(g.crop.w * W)), Math.max(1, Math.round(g.crop.h * H))];
}
