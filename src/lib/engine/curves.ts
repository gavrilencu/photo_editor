import type { CurvePoint } from "@/lib/editor/types";

/**
 * Interpolare cubică monotonă (Fritsch–Carlson): curba nu depășește
 * niciodată punctele de control, deci nu apar inversiuni de tonuri.
 */
export function makeCurveFn(points: CurvePoint[]): (x: number) => number {
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  const n = pts.length;
  if (n === 0) return (x) => x;
  if (n === 1) return () => pts[0][1];

  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = xs[i + 1] - xs[i];
    m[i] = dx[i] > 1e-9 ? (ys[i + 1] - ys[i]) / dx[i] : 0;
  }
  const t: number[] = new Array(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      t[i] = tau * a * m[i];
      t[i + 1] = tau * b * m[i];
    }
  }

  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = dx[i];
    if (h <= 1e-9) return ys[i + 1];
    const u = (x - xs[i]) / h;
    const u2 = u * u;
    const u3 = u2 * u;
    const y =
      (2 * u3 - 3 * u2 + 1) * ys[i] +
      (u3 - 2 * u2 + u) * h * t[i] +
      (-2 * u3 + 3 * u2) * ys[i + 1] +
      (u3 - u2) * h * t[i + 1];
    return Math.min(1, Math.max(0, y));
  };
}

export function curveToTable(points: CurvePoint[], size = 256): Float32Array {
  const f = makeCurveFn(points);
  const out = new Float32Array(size);
  for (let i = 0; i < size; i++) out[i] = f(i / (size - 1));
  return out;
}
