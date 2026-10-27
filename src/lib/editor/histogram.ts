import { create } from "zustand";
import type { Histogram } from "@/lib/engine/renderer";

/** Store separat: histograma se actualizează des și nu trebuie să re-randeze editorul. */
export const useHistogram = create<{ hist: Histogram | null }>(() => ({ hist: null }));

/** Desenează histograma RGB (sau doar luminanța) într-un canvas. */
export function drawHistogram(canvas: HTMLCanvasElement, hist: Histogram | null, mode: "rgb" | "luma" | "r" | "g" | "b") {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  if (!hist) return;

  const channels: { data: Uint32Array; color: string }[] =
    mode === "rgb"
      ? [
          { data: hist.r, color: "rgba(255,70,70,0.75)" },
          { data: hist.g, color: "rgba(70,220,90,0.75)" },
          { data: hist.b, color: "rgba(80,130,255,0.75)" },
        ]
      : mode === "luma"
        ? [{ data: hist.l, color: "rgba(200,200,210,0.35)" }]
        : [{ data: hist[mode], color: { r: "rgba(255,70,70,0.4)", g: "rgba(70,220,90,0.4)", b: "rgba(80,130,255,0.4)" }[mode] }];

  // normalizare robustă (ignoră vârfurile extreme de la capete)
  let peak = 1;
  for (const c of channels) {
    for (let i = 2; i < 254; i++) peak = Math.max(peak, c.data[i]);
  }
  const scale = (v: number) => Math.min(1, Math.sqrt(v / peak));

  ctx.globalCompositeOperation = mode === "rgb" ? "lighter" : "source-over";
  for (const c of channels) {
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < 256; i++) {
      ctx.lineTo((i / 255) * w, h - scale(c.data[i]) * h * 0.95);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = c.color;
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}
