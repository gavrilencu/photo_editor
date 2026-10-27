"use client";

import { useEffect, useRef } from "react";
import { drawHistogram, useHistogram } from "@/lib/editor/histogram";

export function HistogramView({ mode = "rgb", className = "" }: { mode?: "rgb" | "luma" | "r" | "g" | "b"; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const hist = useHistogram((s) => s.hist);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    drawHistogram(c, hist, mode);
    const ro = new ResizeObserver(() => drawHistogram(c, useHistogram.getState().hist, mode));
    ro.observe(c);
    return () => ro.disconnect();
  }, [hist, mode]);

  return <canvas ref={ref} className={className} aria-hidden />;
}
