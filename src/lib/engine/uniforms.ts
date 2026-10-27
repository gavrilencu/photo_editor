import { isIdentityCurve } from "@/lib/editor/defaults";
import type { EditState, GradeWheel } from "@/lib/editor/types";

export interface DevelopUniforms {
  exposure: number;
  wb: [number, number, number];
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  clarity: number;
  dehaze: number;
  sharpen: number;
  denoise: number;
  vibrance: number;
  saturation: number;
  hsl: Float32Array;
  useHsl: boolean;
  gradeS: [number, number, number];
  gradeM: [number, number, number];
  gradeH: [number, number, number];
  gradeBalance: number;
  fade: number;
  useCurves: boolean;
}

export interface EffectUniforms {
  vignette: number;
  vigMid: number;
  vigFeather: number;
  vigRound: number;
  grain: number;
  grainSize: number;
}

function hueToRgb(hue: number): [number, number, number] {
  const h = (((hue % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  const table: [number, number, number][] = [
    [1, x, 0],
    [x, 1, 0],
    [0, 1, x],
    [0, x, 1],
    [x, 0, 1],
    [1, 0, x],
  ];
  return table[Math.floor(h) % 6];
}

/** Deplasare de culoare cu luminanță zero (nu schimbă luminozitatea). */
function gradeOffset(w: GradeWheel): [number, number, number] {
  const [r, g, b] = hueToRgb(w.hue);
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const k = (w.sat / 100) * 0.3;
  return [(r - l) * k, (g - l) * k, (b - l) * k];
}

function whiteBalance(temperature: number, tint: number): [number, number, number] {
  const t = temperature / 100;
  const ti = tint / 100;
  const r = Math.pow(2, t * 0.55 + ti * 0.08);
  const g = Math.pow(2, -ti * 0.38);
  const b = Math.pow(2, -t * 0.65 + ti * 0.08);
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [r / l, g / l, b / l];
}

export function developUniforms(e: EditState): DevelopUniforms {
  const a = e.adj;
  const hsl = new Float32Array(24);
  let useHsl = false;
  e.hsl.forEach((band, i) => {
    hsl[i * 3] = band.h / 100;
    hsl[i * 3 + 1] = band.s / 100;
    hsl[i * 3 + 2] = band.l / 100;
    if (band.h || band.s || band.l) useHsl = true;
  });
  const c = e.curves;
  return {
    exposure: a.exposure,
    wb: whiteBalance(a.temperature, a.tint),
    contrast: a.contrast / 100,
    highlights: a.highlights / 100,
    shadows: a.shadows / 100,
    whites: a.whites / 100,
    blacks: a.blacks / 100,
    clarity: a.clarity / 100,
    dehaze: a.dehaze / 100,
    sharpen: a.sharpen / 100,
    denoise: a.denoise / 100,
    vibrance: a.vibrance / 100,
    saturation: a.saturation / 100,
    hsl,
    useHsl,
    gradeS: gradeOffset(e.grading.shadows),
    gradeM: gradeOffset(e.grading.midtones),
    gradeH: gradeOffset(e.grading.highlights),
    gradeBalance: e.grading.balance / 100,
    fade: a.fade / 100,
    useCurves: !(isIdentityCurve(c.master) && isIdentityCurve(c.r) && isIdentityCurve(c.g) && isIdentityCurve(c.b)),
  };
}

export function effectUniforms(e: EditState): EffectUniforms {
  const a = e.adj;
  return {
    vignette: a.vignette / 100,
    vigMid: a.vignetteMidpoint / 100,
    vigFeather: a.vignetteFeather / 100,
    vigRound: a.vignetteRoundness / 100,
    grain: a.grain / 100,
    grainSize: a.grainSize / 100,
  };
}
