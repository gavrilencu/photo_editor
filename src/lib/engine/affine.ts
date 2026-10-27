/**
 * Transformare afină 2D: [a, b, c, d, e, f]
 *   x' = a·x + c·y + e
 *   y' = b·x + d·y + f
 * (aceeași convenție ca DOMMatrix / CanvasRenderingContext2D).
 */
export type Affine = [number, number, number, number, number, number];

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

/** Compunere: rezultatul aplică întâi `m`, apoi `n`. */
export function then(m: Affine, n: Affine): Affine {
  const [a1, b1, c1, d1, e1, f1] = m;
  const [a2, b2, c2, d2, e2, f2] = n;
  return [
    a2 * a1 + c2 * b1,
    b2 * a1 + d2 * b1,
    a2 * c1 + c2 * d1,
    b2 * c1 + d2 * d1,
    a2 * e1 + c2 * f1 + e2,
    b2 * e1 + d2 * f1 + f2,
  ];
}

/** Compune o listă de transformări în ordinea aplicării. */
export function chain(...ms: Affine[]): Affine {
  return ms.reduce((acc, m) => then(acc, m), IDENTITY);
}

export function translate(x: number, y: number): Affine {
  return [1, 0, 0, 1, x, y];
}

export function scale(sx: number, sy = sx): Affine {
  return [sx, 0, 0, sy, 0, 0];
}

export function rotate(rad: number): Affine {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, s, -s, c, 0, 0];
}

export function invert(m: Affine): Affine {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) return IDENTITY;
  const ia = d / det;
  const ib = -b / det;
  const ic = -c / det;
  const id = a / det;
  return [ia, ib, ic, id, -(ia * e + ic * f), -(ib * e + id * f)];
}

export function apply(m: Affine, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Matrice 3x3 column-major pentru uniform-uri GLSL `mat3`. */
export function toMat3(m: Affine): Float32Array {
  return new Float32Array([m[0], m[1], 0, m[2], m[3], 0, m[4], m[5], 1]);
}
