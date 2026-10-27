"use client";

import { useEffect, useRef, useState } from "react";
import { applyHeal } from "@/lib/editor/actions";
import { useHistogram } from "@/lib/editor/histogram";
import { MAX_ZOOM, MIN_ZOOM, sceneFromState, zoomAt } from "@/lib/editor/scene";
import { useEditor } from "@/lib/editor/store";
import { devicePxToContent, finalOutputBase } from "@/lib/editor/view";
import { apply as applyAffine } from "@/lib/engine/affine";
import { getRenderer, setRenderer } from "@/lib/engine/instance";
import { editorDoc } from "@/lib/editor/document";
import { Renderer } from "@/lib/engine/renderer";
import { BrushLayer } from "./BrushLayer";
import { CropOverlay } from "./CropOverlay";
import { HistogramView } from "./Histogram";

type Gesture =
  | { type: "pan"; x0: number; y0: number; panX: number; panY: number; moved: boolean }
  | { type: "pinch"; d0: number; mx0: number; my0: number; zoom0: number; panX0: number; panY0: number }
  | { type: "brush" }
  | null;

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export function Viewport() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const [renderer, setRendererState] = useState<Renderer | null>(null);
  const [glError, setGlError] = useState<string | null>(null);

  const tool = useEditor((s) => s.tool);
  const compare = useEditor((s) => s.compare);
  const showHistogram = useEditor((s) => s.showHistogram);
  const version = useEditor((s) => s.image?.version);

  // --------------------------------------------------------- renderer
  useEffect(() => {
    let r: Renderer;
    try {
      r = new Renderer(canvasRef.current!);
    } catch (e) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- eroare de inițializare WebGL
      setGlError(e instanceof Error ? e.message : String(e));
      return;
    }
    setRenderer(r);
    setRendererState(r);
    return () => {
      setRenderer(null);
      r.dispose();
    };
  }, []);

  // imaginea sursă (la încărcare și după retuș)
  useEffect(() => {
    const p = editorDoc.proxy;
    if (renderer && version && p) renderer.setSource(p, p.width, p.height);
  }, [renderer, version]);

  // store → renderer (fără re-randări React)
  useEffect(() => {
    if (!renderer) return;
    const sync = () => {
      const s = useEditor.getState();
      const scene = sceneFromState(s);
      if (!scene) return;
      renderer.setEdit(s.edit);
      const c = renderer.canvas;
      renderer.setDisplay({
        ...scene.base,
        pxToContent: devicePxToContent(scene.layout, c.width, c.height, s.viewport.cssW, s.viewport.cssH),
        split: s.holdOriginal ? 1e9 : s.compare && s.tool !== "crop" ? s.splitPos * c.width : -1,
      });
    };
    sync();
    return useEditor.subscribe(sync);
  }, [renderer]);

  // histograma (calculată întârziat, doar când e vizibilă)
  useEffect(() => {
    if (!renderer) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const compute = () => {
      const s = useEditor.getState();
      if (!s.image || !(s.showHistogram || s.tool === "curves")) return;
      useHistogram.setState({ hist: renderer.histogram(finalOutputBase(s.image.width, s.image.height, s.edit.geometry)) });
    };
    const schedule = () => {
      clearTimeout(t);
      t = setTimeout(compute, 140);
    };
    renderer.setDevelopedListener(schedule);
    const unsub = useEditor.subscribe((s, p) => {
      if (s.edit.geometry !== p.edit.geometry || s.showHistogram !== p.showHistogram || s.tool !== p.tool || s.image !== p.image) {
        schedule();
      }
    });
    schedule();
    return () => {
      unsub();
      clearTimeout(t);
      renderer.setDevelopedListener(null);
    };
  }, [renderer]);

  // dimensiunea canvas-ului
  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width * dpr));
      const h = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      useEditor.getState().setViewport(r.width, r.height);
      getRenderer()?.render();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // zoom cu rotița / pinch pe trackpad
  useEffect(() => {
    const wrap = wrapRef.current!;
    const onWheel = (e: WheelEvent) => {
      if (!useEditor.getState().image) return;
      e.preventDefault();
      const r = wrap.getBoundingClientRect();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)));
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
  }, []);

  // --------------------------------------------------------- gesturi
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture>(null);
  const lastTap = useRef({ t: 0, x: 0, y: 0 });

  const local = (e: React.PointerEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    const { view } = useEditor.getState();
    gesture.current = {
      type: "pinch",
      d0: Math.max(1, dist(a, b)),
      mx0: (a.x + b.x) / 2,
      my0: (a.y + b.y) / 2,
      zoom0: view.zoom,
      panX0: view.panX,
      panY0: view.panY,
    };
  };

  const startPan = (p: { x: number; y: number }) => {
    const { view } = useEditor.getState();
    gesture.current = { type: "pan", x0: p.x, y0: p.y, panX: view.panX, panY: view.panY, moved: false };
  };

  const brushPoint = (p: { x: number; y: number }): [number, number] | null => {
    const scene = sceneFromState();
    if (!scene) return null;
    return applyAffine(scene.cssToSource, p.x, p.y);
  };

  const toggleZoom = (p: { x: number; y: number }) => {
    const s = useEditor.getState();
    const scene = sceneFromState(s);
    if (!scene) return;
    if (s.view.zoom > 1.05) {
      s.resetView();
      return;
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const perZoom = scene.cssPerSourcePx / s.view.zoom;
    const target = Math.max(2.5, 1 / (dpr * perZoom));
    zoomAt(p.x, p.y, target / s.view.zoom);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const s = useEditor.getState();
    if (!s.image) return;
    if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);

    if (pointers.current.size === 2) {
      // al doilea deget: anulează trasarea și începe pinch-zoom
      if (gesture.current?.type === "brush") s.set({ liveStroke: null });
      startPinch();
      return;
    }
    if (pointers.current.size > 2) return;

    if (s.tool === "heal" && e.button === 0 && !s.busy) {
      const pt = brushPoint(p);
      const scene = sceneFromState(s);
      if (!pt || !scene) return;
      gesture.current = { type: "brush" };
      s.set({ liveStroke: { points: [pt], radius: s.brushSize / 2 / scene.cssPerSourcePx } });
      return;
    }
    startPan(p);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = local(e);
    const cursor = cursorRef.current;
    if (cursor) {
      const show = e.pointerType === "mouse" && useEditor.getState().tool === "heal";
      cursor.style.display = show ? "block" : "none";
      cursor.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
    }
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    const s = useEditor.getState();
    if (!g) return;

    if (g.type === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const f = dist(a, b) / g.d0;
      const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, g.zoom0 * f));
      const k = nz / g.zoom0;
      const cx = s.viewport.cssW / 2;
      const cy = s.viewport.cssH / 2;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      s.setView({
        zoom: nz,
        panX: mx - cx - (g.mx0 - cx - g.panX0) * k,
        panY: my - cy - (g.my0 - cy - g.panY0) * k,
      });
    } else if (g.type === "pan") {
      const dx = p.x - g.x0;
      const dy = p.y - g.y0;
      if (Math.hypot(dx, dy) > 4) g.moved = true;
      if (g.moved) s.setView({ panX: g.panX + dx, panY: g.panY + dy });
    } else if (g.type === "brush" && s.liveStroke) {
      const pt = brushPoint(p);
      if (!pt) return;
      const pts = s.liveStroke.points;
      const last = pts[pts.length - 1];
      if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) > s.liveStroke.radius * 0.2) {
        s.set({ liveStroke: { ...s.liveStroke, points: [...pts, pt] } });
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    const s = useEditor.getState();

    if (g?.type === "brush") {
      gesture.current = null;
      const stroke = s.liveStroke;
      s.set({ liveStroke: null });
      if (stroke && e.type === "pointerup") {
        s.set({ strokes: [...s.strokes, stroke] });
        if (s.autoHeal) void applyHeal();
      }
      return;
    }

    if (g?.type === "pinch") {
      if (pointers.current.size === 1) {
        startPan([...pointers.current.values()][0]);
      } else if (pointers.current.size === 0) {
        gesture.current = null;
        if (s.view.zoom < 1) s.resetView();
      }
      return;
    }

    if (g?.type === "pan" && pointers.current.size === 0) {
      gesture.current = null;
      if (!g.moved && e.type === "pointerup" && s.tool !== "heal") {
        // dublu-tap / dublu-click = zoom
        const now = performance.now();
        const lt = lastTap.current;
        if (now - lt.t < 300 && Math.hypot(p.x - lt.x, p.y - lt.y) < 30) {
          lastTap.current = { t: 0, x: 0, y: 0 };
          toggleZoom(p);
        } else {
          lastTap.current = { t: now, x: p.x, y: p.y };
        }
      }
      if (s.view.zoom < 1) s.resetView();
    }
  };

  const onPointerLeave = () => {
    if (cursorRef.current) cursorRef.current.style.display = "none";
  };

  return (
    <div
      ref={wrapRef}
      className={`relative size-full touch-none overflow-hidden bg-bg ${tool === "heal" ? "cursor-none" : "cursor-grab active:cursor-grabbing"}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerLeave}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
      {tool === "heal" && <BrushLayer />}
      {tool === "crop" && <CropOverlay />}
      {compare && tool !== "crop" && <SplitHandle />}
      {showHistogram && (
        <div className="pointer-events-none absolute right-3 top-3 h-20 w-44 rounded-lg bg-black/55 p-1.5 ring-1 ring-white/10 backdrop-blur-sm">
          <HistogramView className="size-full" />
        </div>
      )}
      <ZoomBadge />
      <div
        ref={cursorRef}
        className="pointer-events-none absolute left-0 top-0 hidden rounded-full border-[1.5px] border-white shadow-[0_0_0_1px_rgba(0,0,0,.6)]"
        style={{ width: "var(--brush)", height: "var(--brush)" }}
      />
      <BrushSizeVar target={cursorRef} />
      {glError && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-danger">{glError}</div>
      )}
    </div>
  );
}

/** Ține mărimea pensulei într-o variabilă CSS (fără re-randarea Viewport-ului). */
function BrushSizeVar({ target }: { target: React.RefObject<HTMLDivElement | null> }) {
  const size = useEditor((s) => s.brushSize);
  useEffect(() => {
    target.current?.style.setProperty("--brush", `${size}px`);
  }, [size, target]);
  return null;
}

function SplitHandle() {
  const splitPos = useEditor((s) => s.splitPos);
  const set = useEditor((s) => s.set);
  const active = useRef<number | null>(null);

  const update = (e: React.PointerEvent) => {
    const parent = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
    set({ splitPos: Math.min(0.98, Math.max(0.02, (e.clientX - parent.left) / parent.width)) });
  };

  return (
    <>
      <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,.4)]" style={{ left: `${splitPos * 100}%` }} />
      <span className="pointer-events-none absolute left-3 top-3 rounded bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white/90">
        Înainte
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white/90">
        După
      </span>
      <div
        role="slider"
        aria-label="Comparare înainte/după"
        aria-valuenow={Math.round(splitPos * 100)}
        className="absolute top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center"
        style={{ left: `${splitPos * 100}%` }}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          active.current = e.pointerId;
        }}
        onPointerMove={(e) => {
          if (active.current === e.pointerId) update(e);
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          active.current = null;
        }}
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-white text-[11px] font-bold text-black shadow-lg">⇆</span>
      </div>
    </>
  );
}

function ZoomBadge() {
  const zoom = useEditor((s) => s.view.zoom);
  const resetView = useEditor((s) => s.resetView);
  // dependențe ale scenei (pentru re-randare)
  useEditor((s) => s.viewport);
  useEditor((s) => s.edit.geometry);
  useEditor((s) => s.tool);
  const scene = sceneFromState();
  if (!scene) return null;
  const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
  const pct = Math.round(scene.cssPerSourcePx * dpr * 100);
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={resetView}
      className="absolute bottom-3 left-3 rounded-md bg-black/55 px-2 py-1 font-mono text-[11px] text-white/80 ring-1 ring-white/10 backdrop-blur-sm hover:text-white"
      title="Potrivește în ecran"
    >
      {zoom === 1 ? `Potrivit · ${pct}%` : `${pct}%`}
    </button>
  );
}
