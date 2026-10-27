"use client";

import { useEffect, useRef } from "react";
import { sceneFromState } from "@/lib/editor/scene";
import { useEditor } from "@/lib/editor/store";
import { apply } from "@/lib/engine/affine";

/** Afișează zona pictată pentru ștergere, peste imagine. */
export function BrushLayer() {
  const ref = useRef<HTMLCanvasElement>(null);
  const busy = useEditor((s) => !!s.busy);

  useEffect(() => {
    const c = ref.current!;
    const draw = () => {
      const s = useEditor.getState();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(s.viewport.cssW * dpr));
      const h = Math.max(1, Math.round(s.viewport.cssH * dpr));
      const all = s.liveStroke ? [...s.strokes, s.liveStroke] : s.strokes;
      const scene = sceneFromState(s);
      if (!scene || all.length === 0) {
        // golire completă: realocarea bitmap-ului e mai sigură decât clearRect
        // (Chrome poate restaura un snapshot vechi al canvas-ului accelerat)
        c.width = w;
        c.height = h;
        c.style.visibility = "hidden";
        return;
      }
      c.style.visibility = "visible";
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const ctx = c.getContext("2d")!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = "rgb(255, 56, 92)";
      ctx.fillStyle = "rgb(255, 56, 92)";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const st of all) {
        const r = st.radius * scene.cssPerSourcePx;
        const pts = st.points.map(([x, y]) => apply(scene.sourceToCss, x, y));
        if (pts.length === 1) {
          ctx.beginPath();
          ctx.arc(pts[0][0], pts[0][1], r, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        ctx.lineWidth = r * 2;
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
    };
    draw();
    return useEditor.subscribe((s, p) => {
      if (
        s.strokes !== p.strokes ||
        s.liveStroke !== p.liveStroke ||
        s.view !== p.view ||
        s.viewport !== p.viewport ||
        s.edit.geometry !== p.edit.geometry
      ) {
        draw();
      }
    });
  }, []);

  return (
    <canvas
      ref={ref}
      className={`pointer-events-none absolute inset-0 size-full ${busy ? "animate-pulse opacity-60" : "opacity-50"}`}
    />
  );
}
