import { probeWebGL, type Renderer } from "./renderer";

let current: Renderer | null = null;
let probe: ReturnType<typeof probeWebGL> | null = null;

export function setRenderer(r: Renderer | null) {
  current = r;
}

export function getRenderer(): Renderer | null {
  return current;
}

export function webglInfo() {
  if (!probe) probe = probeWebGL();
  return probe;
}
