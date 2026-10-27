export type AdjustKey =
  | "exposure"
  | "contrast"
  | "highlights"
  | "shadows"
  | "whites"
  | "blacks"
  | "temperature"
  | "tint"
  | "vibrance"
  | "saturation"
  | "clarity"
  | "dehaze"
  | "sharpen"
  | "denoise"
  | "vignette"
  | "vignetteMidpoint"
  | "vignetteFeather"
  | "vignetteRoundness"
  | "grain"
  | "grainSize"
  | "fade";

/** Valorile sunt în unități de UI (ex. -100..100, expunerea în EV). */
export type Adjustments = Record<AdjustKey, number>;

/** Ajustare per bandă de culoare, fiecare componentă în -100..100. */
export interface HslBand {
  h: number;
  s: number;
  l: number;
}

/** Punct de curbă, coordonate normalizate 0..1. */
export type CurvePoint = [number, number];

export interface Curves {
  master: CurvePoint[];
  r: CurvePoint[];
  g: CurvePoint[];
  b: CurvePoint[];
}

export type CurveChannel = keyof Curves;

export interface GradeWheel {
  /** 0..360 */
  hue: number;
  /** 0..100 */
  sat: number;
}

export interface Grading {
  shadows: GradeWheel;
  midtones: GradeWheel;
  highlights: GradeWheel;
  /** -100..100 */
  balance: number;
}

export type GradeZone = "shadows" | "midtones" | "highlights";

/** Dreptunghi normalizat (0..1) în cadrul imaginii orientate și îndreptate. */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Geometry {
  /** Rotiri de 90° în sensul acelor de ceasornic. */
  rotation: 0 | 1 | 2 | 3;
  flipH: boolean;
  flipV: boolean;
  /** Îndreptare fină, în grade (-45..45). */
  angle: number;
  crop: CropRect;
  /** Raport lățime/înălțime în pixeli; null = liber. */
  aspect: number | null;
}

export interface LutSetting {
  id: string;
  /** 0..100 */
  amount: number;
}

export interface PresetSetting {
  id: string;
  /** 0..100 */
  amount: number;
}

export interface EditState {
  adj: Adjustments;
  hsl: HslBand[];
  curves: Curves;
  grading: Grading;
  geometry: Geometry;
  lut: LutSetting | null;
  preset: PresetSetting | null;
  /** Câte operații de retuș (ștergere obiecte) sunt aplicate pe pixelii sursă. */
  healCount: number;
}

export type ToolId = "filters" | "light" | "color" | "curves" | "effects" | "crop" | "heal";

export interface Stroke {
  /** Puncte în pixeli ai imaginii originale. */
  points: [number, number][];
  /** Raza pensulei în pixeli ai imaginii originale. */
  radius: number;
}
