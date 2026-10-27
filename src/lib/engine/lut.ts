export interface Lut3D {
  id: string;
  name: string;
  size: number;
  /** RGB float, R variază cel mai rapid, apoi G, apoi B (ordinea .cube). */
  data: Float32Array;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
}

/** Parsează un fișier .cube (Adobe/Resolve) cu LUT 3D. */
export function parseCube(text: string, name: string): Lut3D {
  let size = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  const values: number[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    const key = parts[0].toUpperCase();
    if (key === "TITLE") continue;
    if (key === "LUT_1D_SIZE") throw new Error("LUT-urile 1D nu sunt suportate, doar 3D.");
    if (key === "LUT_3D_SIZE") {
      size = parseInt(parts[1], 10);
      continue;
    }
    if (key === "DOMAIN_MIN") {
      domainMin = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
      continue;
    }
    if (key === "DOMAIN_MAX") {
      domainMax = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
      continue;
    }
    if (/^[A-Z_]+$/.test(key)) continue; // alte cuvinte-cheie necunoscute
    if (parts.length >= 3) {
      values.push(Number(parts[0]), Number(parts[1]), Number(parts[2]));
    }
  }

  if (!size || size < 2 || size > 128) throw new Error("Fișier .cube invalid: lipsește LUT_3D_SIZE.");
  const expected = size * size * size * 3;
  if (values.length < expected) throw new Error(`Fișier .cube incomplet (${values.length / 3} din ${expected / 3} valori).`);
  if (values.slice(0, expected).some((v) => !Number.isFinite(v))) throw new Error("Fișier .cube conține valori invalide.");

  return {
    id: `lut-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.replace(/\.cube$/i, ""),
    size,
    data: new Float32Array(values.slice(0, expected)),
    domainMin,
    domainMax,
  };
}

/** Registrul LUT-urilor importate (datele mari stau în afara store-ului). */
export const lutRegistry = new Map<string, Lut3D>();
