/**
 * Inpainting bazat pe exemple (Wexler et al. + PatchMatch, multi-scală).
 * Zona mascată este reconstruită din petice copiate din restul imaginii,
 * de la rezoluție mică spre rezoluție completă. Rulează în Web Worker.
 */

const R = 3; // raza peticului → 7×7

interface Level {
  w: number;
  h: number;
  img: Float32Array; // RGB
  hole: Uint8Array;
  holeList: Int32Array;
  holeIdx: Int32Array;
  valid: Uint8Array;
  validList: Int32Array;
}

function makeRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

function makeLevel(w: number, h: number, img: Float32Array, hole: Uint8Array): Level {
  const n = w * h;
  const holeIdx = new Int32Array(n).fill(-1);
  let count = 0;
  for (let i = 0; i < n; i++) if (hole[i]) holeIdx[i] = count++;
  const holeList = new Int32Array(count);
  for (let i = 0; i < n; i++) if (hole[i]) holeList[holeIdx[i]] = i;

  // dilatare a găurii cu R (separabil): un petic sursă valid nu atinge gaura
  const rowDil = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let run = 0;
    // număr de pixeli-gaură în fereastra [x-R, x+R]
    for (let x = 0; x < Math.min(R, w); x++) run += hole[row + x];
    for (let x = 0; x < w; x++) {
      const add = x + R;
      if (add < w) run += hole[row + add];
      const rem = x - R - 1;
      if (rem >= 0) run -= hole[row + rem];
      rowDil[row + x] = run > 0 ? 1 : 0;
    }
  }
  const valid = new Uint8Array(n);
  let validCount = 0;
  for (let x = 0; x < w; x++) {
    let run = 0;
    for (let y = 0; y < Math.min(R, h); y++) run += rowDil[y * w + x];
    for (let y = 0; y < h; y++) {
      const add = y + R;
      if (add < h) run += rowDil[add * w + x];
      const rem = y - R - 1;
      if (rem >= 0) run -= rowDil[rem * w + x];
      const inside = x >= R && x < w - R && y >= R && y < h - R;
      if (inside && run === 0) {
        valid[y * w + x] = 1;
        validCount++;
      }
    }
  }
  const validList = new Int32Array(validCount);
  for (let i = 0, k = 0; i < n; i++) if (valid[i]) validList[k++] = i;

  return { w, h, img, hole, holeList, holeIdx, valid, validList };
}

function downsample(L: Level): { w: number; h: number; img: Float32Array; hole: Uint8Array } {
  const w2 = Math.ceil(L.w / 2);
  const h2 = Math.ceil(L.h / 2);
  const img = new Float32Array(w2 * h2 * 3);
  const hole = new Uint8Array(w2 * h2);
  for (let y = 0; y < h2; y++) {
    for (let x = 0; x < w2; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      let anyHole = 0;
      for (let dy = 0; dy < 2; dy++) {
        const yy = 2 * y + dy;
        if (yy >= L.h) continue;
        for (let dx = 0; dx < 2; dx++) {
          const xx = 2 * x + dx;
          if (xx >= L.w) continue;
          const i = yy * L.w + xx;
          if (L.hole[i]) {
            anyHole = 1;
          } else {
            r += L.img[i * 3];
            g += L.img[i * 3 + 1];
            b += L.img[i * 3 + 2];
            n++;
          }
        }
      }
      const o = y * w2 + x;
      hole[o] = anyHole;
      if (n) {
        img[o * 3] = r / n;
        img[o * 3 + 1] = g / n;
        img[o * 3 + 2] = b / n;
      }
    }
  }
  return { w: w2, h: h2, img, hole };
}

/** Umplere inițială „în foi de ceapă”: media vecinilor deja cunoscuți. */
function onionFill(L: Level) {
  const { w, h, img, hole } = L;
  const known = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) known[i] = hole[i] ? 0 : 1;
  let remaining = L.holeList.length;
  const updates: number[] = [];
  const vals: number[] = [];
  while (remaining > 0) {
    updates.length = 0;
    vals.length = 0;
    for (let k = 0; k < L.holeList.length; k++) {
      const p = L.holeList[k];
      if (known[p]) continue;
      const px = p % w;
      const py = (p / w) | 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = py + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = px + dx;
          if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (!known[q]) continue;
          r += img[q * 3];
          g += img[q * 3 + 1];
          b += img[q * 3 + 2];
          n++;
        }
      }
      if (n) {
        updates.push(p);
        vals.push(r / n, g / n, b / n);
      }
    }
    if (updates.length === 0) {
      // nimic cunoscut în jur: gri neutru
      for (const p of L.holeList) {
        if (!known[p]) {
          img[p * 3] = img[p * 3 + 1] = img[p * 3 + 2] = 128;
          known[p] = 1;
        }
      }
      break;
    }
    for (let i = 0; i < updates.length; i++) {
      const p = updates[i];
      img[p * 3] = vals[i * 3];
      img[p * 3 + 1] = vals[i * 3 + 1];
      img[p * 3 + 2] = vals[i * 3 + 2];
      known[p] = 1;
    }
    remaining -= updates.length;
  }
}

/** Suma pătratelor diferențelor între peticele centrate în p și q (q valid). */
function patchDist(L: Level, p: number, q: number, best: number): number {
  const { w, h, img } = L;
  const px = p % w;
  const py = (p / w) | 0;
  const qx = q % w;
  const qy = (q / w) | 0;
  let sum = 0;
  for (let dy = -R; dy <= R; dy++) {
    const yy = py + dy;
    if (yy < 0 || yy >= h) continue;
    const prow = yy * w;
    const qrow = (qy + dy) * w + qx;
    for (let dx = -R; dx <= R; dx++) {
      const xx = px + dx;
      if (xx < 0 || xx >= w) continue;
      const a = (prow + xx) * 3;
      const b = (qrow + dx) * 3;
      const d0 = img[a] - img[b];
      const d1 = img[a + 1] - img[b + 1];
      const d2 = img[a + 2] - img[b + 2];
      sum += d0 * d0 + d1 * d1 + d2 * d2;
    }
    if (sum >= best) return sum;
  }
  return sum;
}

function patchCount(L: Level, p: number): number {
  const px = p % L.w;
  const py = (p / L.w) | 0;
  const cx = Math.min(px + R, L.w - 1) - Math.max(px - R, 0) + 1;
  const cy = Math.min(py + R, L.h - 1) - Math.max(py - R, 0) + 1;
  return cx * cy * 3;
}

function patchMatch(L: Level, nnf: Int32Array, dist: Float32Array, iters: number, rng: () => number) {
  const { w, h, holeList, holeIdx, valid } = L;
  const n = holeList.length;
  const maxRad = Math.max(w, h);
  for (let it = 0; it < iters; it++) {
    const fwd = it % 2 === 0;
    const step = fwd ? 1 : -1;
    for (let c = 0; c < n; c++) {
      const k = fwd ? c : n - 1 - c;
      const p = holeList[k];
      const px = p % w;
      const py = (p / w) | 0;
      let best = nnf[k];
      let bestD = dist[k];

      // propagare de la vecinul orizontal
      const nx = px - step;
      if (nx >= 0 && nx < w) {
        const ni = holeIdx[p - step];
        if (ni >= 0) {
          const src = nnf[ni];
          const cx = (src % w) + step;
          if (cx >= 0 && cx < w) {
            const cand = src + step;
            if (cand !== best && valid[cand]) {
              const d = patchDist(L, p, cand, bestD);
              if (d < bestD) {
                bestD = d;
                best = cand;
              }
            }
          }
        }
      }
      // propagare de la vecinul vertical
      const ny = py - step;
      if (ny >= 0 && ny < h) {
        const ni = holeIdx[p - step * w];
        if (ni >= 0) {
          const cand = nnf[ni] + step * w;
          if (cand >= 0 && cand < w * h && cand !== best && valid[cand]) {
            const d = patchDist(L, p, cand, bestD);
            if (d < bestD) {
              bestD = d;
              best = cand;
            }
          }
        }
      }
      // căutare aleatoare cu rază descrescătoare
      for (let rad = maxRad; rad >= 1; rad >>= 1) {
        const bx = best % w;
        const by = (best / w) | 0;
        const cx = bx + Math.floor((rng() * 2 - 1) * rad);
        const cy = by + Math.floor((rng() * 2 - 1) * rad);
        if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
        const cand = cy * w + cx;
        if (cand === best || !valid[cand]) continue;
        const d = patchDist(L, p, cand, bestD);
        if (d < bestD) {
          bestD = d;
          best = cand;
        }
      }
      nnf[k] = best;
      dist[k] = bestD;
    }
  }
}

/** Reconstrucție prin vot ponderat al tuturor peticelor care acoperă un pixel. */
function vote(L: Level, nnf: Int32Array, dist: Float32Array | null) {
  const { w, h, holeList, holeIdx, img } = L;
  const n = holeList.length;
  const acc = new Float64Array(n * 3);
  const wacc = new Float64Array(n);

  let sigma2 = 1;
  if (dist) {
    let s = 0;
    for (let k = 0; k < n; k++) s += dist[k] / patchCount(L, holeList[k]);
    sigma2 = Math.max(1, s / Math.max(1, n));
  }

  for (let k = 0; k < n; k++) {
    const p = holeList[k];
    const q = nnf[k];
    const wgt = dist ? Math.exp(-dist[k] / patchCount(L, p) / (2 * sigma2)) : 1;
    if (wgt <= 0) continue;
    const px = p % w;
    const py = (p / w) | 0;
    const qx = q % w;
    const qy = (q / w) | 0;
    for (let dy = -R; dy <= R; dy++) {
      const ty = py + dy;
      if (ty < 0 || ty >= h) continue;
      const srow = (qy + dy) * w + qx;
      for (let dx = -R; dx <= R; dx++) {
        const tx = px + dx;
        if (tx < 0 || tx >= w) continue;
        const ti = holeIdx[ty * w + tx];
        if (ti < 0) continue;
        const s = (srow + dx) * 3;
        acc[ti * 3] += wgt * img[s];
        acc[ti * 3 + 1] += wgt * img[s + 1];
        acc[ti * 3 + 2] += wgt * img[s + 2];
        wacc[ti] += wgt;
      }
    }
  }
  for (let k = 0; k < n; k++) {
    if (wacc[k] <= 0) continue;
    const p = holeList[k] * 3;
    img[p] = acc[k * 3] / wacc[k];
    img[p + 1] = acc[k * 3 + 1] / wacc[k];
    img[p + 2] = acc[k * 3 + 2] / wacc[k];
  }
}

function upsampleNNF(coarse: Level, cnnf: Int32Array, fine: Level, rng: () => number): Int32Array<ArrayBuffer> {
  const out = new Int32Array(fine.holeList.length);
  const nValid = fine.validList.length;
  for (let k = 0; k < fine.holeList.length; k++) {
    const p = fine.holeList[k];
    const x = p % fine.w;
    const y = (p / fine.w) | 0;
    const ck = coarse.holeIdx[(y >> 1) * coarse.w + (x >> 1)];
    let q = -1;
    if (ck >= 0) {
      const cq = cnnf[ck];
      const qx = 2 * (cq % coarse.w) + (x & 1);
      const qy = 2 * ((cq / coarse.w) | 0) + (y & 1);
      if (qx < fine.w && qy < fine.h) {
        const cand = qy * fine.w + qx;
        if (fine.valid[cand]) q = cand;
      }
    }
    out[k] = q >= 0 ? q : fine.validList[(rng() * nValid) | 0];
  }
  return out;
}

function holeExtent(L: Level): number {
  let minX = L.w;
  let minY = L.h;
  let maxX = -1;
  let maxY = -1;
  for (const p of L.holeList) {
    const x = p % L.w;
    const y = (p / L.w) | 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return Math.max(maxX - minX + 1, maxY - minY + 1);
}

export interface InpaintOptions {
  onProgress?: (fraction: number) => void;
  seed?: number;
}

/**
 * @param rgba pixeli RGBA (w×h)
 * @param mask 1 = de reconstruit
 * @returns pixeli RGBA cu zona mascată reconstruită
 */
export function inpaint(
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
  mask: Uint8Array,
  opts: InpaintOptions = {},
): Uint8ClampedArray {
  const n = width * height;
  const img0 = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    img0[i * 3] = rgba[i * 4];
    img0[i * 3 + 1] = rgba[i * 4 + 1];
    img0[i * 3 + 2] = rgba[i * 4 + 2];
  }
  const hole0 = new Uint8Array(n);
  for (let i = 0; i < n; i++) hole0[i] = mask[i] ? 1 : 0;

  const levels: Level[] = [makeLevel(width, height, img0, hole0)];
  const out = new Uint8ClampedArray(rgba);
  if (levels[0].holeList.length === 0) return out;
  if (levels[0].validList.length === 0) {
    throw new Error("Zona selectată acoperă aproape toată imaginea — nu există din ce reconstrui.");
  }

  // piramida: coborâm până când gaura devine mică față de petic
  for (;;) {
    const L = levels[levels.length - 1];
    if (Math.min(L.w, L.h) < 8 * R) break;
    if (holeExtent(L) <= 2 * (2 * R + 1)) break;
    const d = downsample(L);
    const next = makeLevel(d.w, d.h, d.img, d.hole);
    if (next.validList.length < 64 || next.holeList.length === 0) break;
    levels.push(next);
  }

  const rng = makeRng(opts.seed ?? 0x9e3779b9);
  let nnf = new Int32Array(0);
  const total = levels.length;

  for (let li = levels.length - 1; li >= 0; li--) {
    const L = levels[li];
    const n = L.holeList.length;
    const coarsest = li === levels.length - 1;
    if (coarsest) {
      onionFill(L);
      nnf = new Int32Array(n);
      for (let k = 0; k < n; k++) nnf[k] = L.validList[(rng() * L.validList.length) | 0];
    } else {
      nnf = upsampleNNF(levels[li + 1], nnf, L, rng);
      vote(L, nnf, null);
    }
    const dist = new Float32Array(n);
    const em = coarsest ? 6 : li === 0 ? 2 : 3;
    for (let e = 0; e < em; e++) {
      for (let k = 0; k < n; k++) dist[k] = patchDist(L, L.holeList[k], nnf[k], Infinity);
      patchMatch(L, nnf, dist, coarsest ? 4 : 2, rng);
      vote(L, nnf, dist);
    }
    opts.onProgress?.((total - li) / total);
  }

  const L0 = levels[0];
  for (const p of L0.holeList) {
    out[p * 4] = L0.img[p * 3];
    out[p * 4 + 1] = L0.img[p * 3 + 1];
    out[p * 4 + 2] = L0.img[p * 3 + 2];
  }
  return out;
}
