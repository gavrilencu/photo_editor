import { DEFAULT_ADJ, DEFAULT_CURVES, DEFAULT_GRADING, DEFAULT_HSL } from "./defaults";
import type { Adjustments, CurvePoint, Curves, EditState, Grading, GradeWheel, HslBand } from "./types";

export interface Preset {
  id: string;
  name: string;
  adj?: Partial<Adjustments>;
  grading?: Partial<Grading>;
  /** index bandă → ajustare */
  hsl?: Record<number, Partial<HslBand>>;
  curves?: Partial<Curves>;
}

const S_CURVE: CurvePoint[] = [
  [0, 0],
  [0.25, 0.2],
  [0.75, 0.82],
  [1, 1],
];

const MATTE_CURVE: CurvePoint[] = [
  [0, 0.08],
  [0.3, 0.3],
  [0.7, 0.74],
  [1, 0.95],
];

export const PRESETS: Preset[] = [
  {
    id: "vivid",
    name: "Viu",
    adj: { contrast: 18, vibrance: 35, saturation: 8, clarity: 12 },
  },
  {
    id: "dramatic",
    name: "Dramatic",
    adj: { contrast: 35, clarity: 40, highlights: -35, shadows: 20, saturation: -12, vignette: -30 },
  },
  {
    id: "warm",
    name: "Cald",
    adj: { temperature: 28, tint: 4, vibrance: 12 },
  },
  {
    id: "cool",
    name: "Rece",
    adj: { temperature: -26, tint: -3, vibrance: 6 },
  },
  {
    id: "teal-orange",
    name: "Cinematic",
    adj: { contrast: 16, saturation: -6, vignette: -18 },
    grading: { shadows: { hue: 190, sat: 45 }, highlights: { hue: 35, sat: 38 }, balance: -10 },
    hsl: { 1: { s: 15 }, 4: { h: 15 }, 5: { h: -15, s: -10 } },
    curves: { master: S_CURVE },
  },
  {
    id: "film",
    name: "Film",
    adj: { contrast: -8, fade: 32, grain: 28, saturation: -10, temperature: 6 },
    grading: { shadows: { hue: 200, sat: 22 }, highlights: { hue: 45, sat: 20 } },
  },
  {
    id: "vintage",
    name: "Vintage",
    adj: { fade: 40, temperature: 18, saturation: -22, grain: 22, vignette: -28, contrast: -6 },
    grading: { shadows: { hue: 230, sat: 20 }, highlights: { hue: 50, sat: 30 } },
    curves: { b: [[0, 0.1], [1, 0.92]] },
  },
  {
    id: "matte",
    name: "Mat",
    adj: { contrast: -12, saturation: -10 },
    curves: { master: MATTE_CURVE },
  },
  {
    id: "moody",
    name: "Întunecat",
    adj: { exposure: -0.25, contrast: 22, saturation: -28, highlights: -25, vignette: -32, clarity: 10 },
    grading: { shadows: { hue: 215, sat: 30 }, midtones: { hue: 200, sat: 8 } },
  },
  {
    id: "soft",
    name: "Pastel",
    adj: { exposure: 0.15, contrast: -22, clarity: -18, saturation: -15, fade: 18, highlights: -10 },
    grading: { highlights: { hue: 330, sat: 12 } },
  },
  {
    id: "golden",
    name: "Auriu",
    adj: { temperature: 35, tint: 8, vibrance: 20, highlights: -10 },
    grading: { highlights: { hue: 42, sat: 35 }, midtones: { hue: 35, sat: 10 } },
  },
  {
    id: "landscape",
    name: "Peisaj",
    adj: { dehaze: 22, vibrance: 30, clarity: 25, contrast: 10 },
    hsl: { 3: { s: 15, l: -5 }, 4: { s: 10 }, 5: { s: 20, l: -15 } },
  },
  {
    id: "portrait",
    name: "Portret",
    adj: { clarity: -10, vibrance: 15, temperature: 6, shadows: 12 },
    hsl: { 1: { s: -8, l: 10 }, 0: { s: -5 } },
  },
  {
    id: "mono",
    name: "Alb-negru",
    adj: { saturation: -100, contrast: 20 },
  },
  {
    id: "noir",
    name: "Noir",
    adj: { saturation: -100, contrast: 45, clarity: 30, blacks: -20, vignette: -40, grain: 20 },
  },
  {
    id: "sepia",
    name: "Sepia",
    adj: { saturation: -100, contrast: 10, fade: 15 },
    grading: { midtones: { hue: 35, sat: 40 }, shadows: { hue: 25, sat: 25 } },
  },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function lerpWheel(base: GradeWheel, target: GradeWheel | undefined, t: number): GradeWheel {
  if (!target) return base;
  return { hue: target.hue, sat: lerp(base.sat, target.sat, t) };
}

function scaleCurve(points: CurvePoint[], t: number): CurvePoint[] {
  return points.map(([x, y]) => [x, lerp(x, y, t)] as CurvePoint);
}

/** Aplică un preset peste o stare (geometria, LUT-ul și retușul se păstrează). */
export function applyPreset(base: EditState, preset: Preset | null, amount: number): EditState {
  if (!preset) {
    return {
      ...base,
      adj: DEFAULT_ADJ,
      hsl: DEFAULT_HSL,
      curves: DEFAULT_CURVES,
      grading: DEFAULT_GRADING,
      preset: null,
    };
  }
  const t = amount / 100;
  const adj = { ...DEFAULT_ADJ };
  for (const [k, v] of Object.entries(preset.adj ?? {})) {
    const key = k as keyof Adjustments;
    adj[key] = lerp(DEFAULT_ADJ[key], v as number, t);
  }
  const hsl = DEFAULT_HSL.map((band, i) => {
    const p = preset.hsl?.[i];
    if (!p) return band;
    return { h: lerp(0, p.h ?? 0, t), s: lerp(0, p.s ?? 0, t), l: lerp(0, p.l ?? 0, t) };
  });
  const g = preset.grading ?? {};
  const grading: Grading = {
    shadows: lerpWheel(DEFAULT_GRADING.shadows, g.shadows, t),
    midtones: lerpWheel(DEFAULT_GRADING.midtones, g.midtones, t),
    highlights: lerpWheel(DEFAULT_GRADING.highlights, g.highlights, t),
    balance: lerp(0, g.balance ?? 0, t),
  };
  const curves: Curves = {
    master: scaleCurve(preset.curves?.master ?? DEFAULT_CURVES.master, t),
    r: scaleCurve(preset.curves?.r ?? DEFAULT_CURVES.r, t),
    g: scaleCurve(preset.curves?.g ?? DEFAULT_CURVES.g, t),
    b: scaleCurve(preset.curves?.b ?? DEFAULT_CURVES.b, t),
  };
  return { ...base, adj, hsl, grading, curves, preset: { id: preset.id, amount } };
}
