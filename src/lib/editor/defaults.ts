import type {
  AdjustKey,
  Adjustments,
  CurvePoint,
  Curves,
  EditState,
  Geometry,
  Grading,
  HslBand,
} from "./types";

export interface AdjustDef {
  key: AdjustKey;
  label: string;
  min: number;
  max: number;
  step: number;
  def: number;
  /** Gradient CSS opțional pentru pista sliderului. */
  track?: string;
  format?: (v: number) => string;
}

const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);

export const ADJUST_DEFS: Record<AdjustKey, AdjustDef> = {
  exposure: {
    key: "exposure",
    label: "Expunere",
    min: -4,
    max: 4,
    step: 0.01,
    def: 0,
    track: "linear-gradient(90deg,#111,#888,#fff)",
    format: (v) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2)),
  },
  contrast: { key: "contrast", label: "Contrast", min: -100, max: 100, step: 1, def: 0, format: signed },
  highlights: { key: "highlights", label: "Lumini", min: -100, max: 100, step: 1, def: 0, format: signed },
  shadows: { key: "shadows", label: "Umbre", min: -100, max: 100, step: 1, def: 0, format: signed },
  whites: { key: "whites", label: "Alb", min: -100, max: 100, step: 1, def: 0, format: signed },
  blacks: { key: "blacks", label: "Negru", min: -100, max: 100, step: 1, def: 0, format: signed },
  temperature: {
    key: "temperature",
    label: "Temperatură",
    min: -100,
    max: 100,
    step: 1,
    def: 0,
    track: "linear-gradient(90deg,#3a7bd5,#d8d8d8,#f5b041)",
    format: signed,
  },
  tint: {
    key: "tint",
    label: "Nuanță",
    min: -100,
    max: 100,
    step: 1,
    def: 0,
    track: "linear-gradient(90deg,#3fbf5f,#d8d8d8,#d14fd1)",
    format: signed,
  },
  vibrance: { key: "vibrance", label: "Vibranță", min: -100, max: 100, step: 1, def: 0, format: signed },
  saturation: {
    key: "saturation",
    label: "Saturație",
    min: -100,
    max: 100,
    step: 1,
    def: 0,
    track: "linear-gradient(90deg,#8a8a8a,#e04848)",
    format: signed,
  },
  clarity: { key: "clarity", label: "Claritate", min: -100, max: 100, step: 1, def: 0, format: signed },
  dehaze: { key: "dehaze", label: "Anti-ceață", min: -100, max: 100, step: 1, def: 0, format: signed },
  sharpen: { key: "sharpen", label: "Claritate fină", min: 0, max: 150, step: 1, def: 0 },
  denoise: { key: "denoise", label: "Reducere zgomot", min: 0, max: 100, step: 1, def: 0 },
  vignette: { key: "vignette", label: "Vignetă", min: -100, max: 100, step: 1, def: 0, format: signed },
  vignetteMidpoint: { key: "vignetteMidpoint", label: "Punct median", min: 0, max: 100, step: 1, def: 50 },
  vignetteFeather: { key: "vignetteFeather", label: "Estompare", min: 0, max: 100, step: 1, def: 50 },
  vignetteRoundness: { key: "vignetteRoundness", label: "Rotunjime", min: 0, max: 100, step: 1, def: 0 },
  grain: { key: "grain", label: "Granulație", min: 0, max: 100, step: 1, def: 0 },
  grainSize: { key: "grainSize", label: "Mărime granulă", min: 0, max: 100, step: 1, def: 25 },
  fade: { key: "fade", label: "Decolorare", min: 0, max: 100, step: 1, def: 0 },
};

export const DEFAULT_ADJ: Adjustments = Object.fromEntries(
  Object.values(ADJUST_DEFS).map((d) => [d.key, d.def]),
) as Adjustments;

export const HSL_BANDS = [
  { name: "Roșu", hue: 0, color: "#e5484d" },
  { name: "Portocaliu", hue: 30, color: "#f08a24" },
  { name: "Galben", hue: 60, color: "#f5d90a" },
  { name: "Verde", hue: 120, color: "#46a758" },
  { name: "Turcoaz", hue: 180, color: "#12a5b0" },
  { name: "Albastru", hue: 240, color: "#3e63dd" },
  { name: "Violet", hue: 270, color: "#8e4ec6" },
  { name: "Magenta", hue: 300, color: "#d6409f" },
] as const;

export const DEFAULT_HSL: HslBand[] = HSL_BANDS.map(() => ({ h: 0, s: 0, l: 0 }));

export const IDENTITY_CURVE: CurvePoint[] = [
  [0, 0],
  [1, 1],
];

export const DEFAULT_CURVES: Curves = {
  master: IDENTITY_CURVE,
  r: IDENTITY_CURVE,
  g: IDENTITY_CURVE,
  b: IDENTITY_CURVE,
};

export const DEFAULT_GRADING: Grading = {
  shadows: { hue: 220, sat: 0 },
  midtones: { hue: 40, sat: 0 },
  highlights: { hue: 45, sat: 0 },
  balance: 0,
};

export const DEFAULT_GEOMETRY: Geometry = {
  rotation: 0,
  flipH: false,
  flipV: false,
  angle: 0,
  crop: { x: 0, y: 0, w: 1, h: 1 },
  aspect: null,
};

export const DEFAULT_EDIT: EditState = {
  adj: DEFAULT_ADJ,
  hsl: DEFAULT_HSL,
  curves: DEFAULT_CURVES,
  grading: DEFAULT_GRADING,
  geometry: DEFAULT_GEOMETRY,
  lut: null,
  preset: null,
  healCount: 0,
};

export function isIdentityCurve(points: CurvePoint[]): boolean {
  return (
    points.length === 2 &&
    points[0][0] === 0 &&
    points[0][1] === 0 &&
    points[1][0] === 1 &&
    points[1][1] === 1
  );
}
