"use client";

import { useRef, useState } from "react";
import { sceneFromState } from "@/lib/editor/scene";
import { useEditor } from "@/lib/editor/store";
import type { CropRect } from "@/lib/editor/types";

type Handle = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

const MIN = 0.03;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Calculează noul crop pentru un mâner tras cu (du, dv) în coordonate normalizate. */
function computeCrop(h: Handle, c0: CropRect, du: number, dv: number, ratio: number | null): CropRect {
  if (h === "move") {
    return { ...c0, x: clamp(c0.x + du, 0, 1 - c0.w), y: clamp(c0.y + dv, 0, 1 - c0.h) };
  }
  let x0 = c0.x;
  let y0 = c0.y;
  let x1 = c0.x + c0.w;
  let y1 = c0.y + c0.h;
  const n = h.includes("n");
  const s = h.includes("s");
  const w = h.includes("w");
  const e = h.includes("e");

  if (ratio === null) {
    if (w) x0 = clamp(x0 + du, 0, x1 - MIN);
    if (e) x1 = clamp(x1 + du, x0 + MIN, 1);
    if (n) y0 = clamp(y0 + dv, 0, y1 - MIN);
    if (s) y1 = clamp(y1 + dv, y0 + MIN, 1);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  // proporție fixă: colțul opus rămâne ancorat
  const ax = w ? x1 : x0;
  const ay = n ? y1 : y0;
  const sx = w ? -1 : 1;
  const sy = n ? -1 : 1;
  const mx = (w ? x0 : x1) + du;
  const my = (n ? y0 : y1) + dv;
  let cw = Math.max(MIN, (mx - ax) * sx);
  let ch = Math.max(MIN, (my - ay) * sy);
  if (cw / ch > ratio) ch = cw / ratio;
  else cw = ch * ratio;
  const maxW = sx > 0 ? 1 - ax : ax;
  const maxH = sy > 0 ? 1 - ay : ay;
  if (cw > maxW) {
    cw = maxW;
    ch = cw / ratio;
  }
  if (ch > maxH) {
    ch = maxH;
    cw = ch * ratio;
  }
  return { x: sx > 0 ? ax : ax - cw, y: sy > 0 ? ay : ay - ch, w: cw, h: ch };
}

const CORNERS: { h: Handle; cls: string; mark: string }[] = [
  { h: "nw", cls: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize", mark: "left-1/2 top-1/2 border-l-[3px] border-t-[3px]" },
  { h: "ne", cls: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize", mark: "right-1/2 top-1/2 border-r-[3px] border-t-[3px]" },
  { h: "sw", cls: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize", mark: "left-1/2 bottom-1/2 border-l-[3px] border-b-[3px]" },
  { h: "se", cls: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize", mark: "right-1/2 bottom-1/2 border-r-[3px] border-b-[3px]" },
];

const EDGES: { h: Handle; cls: string; bar: string }[] = [
  { h: "n", cls: "left-1/2 top-0 h-8 w-12 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize", bar: "h-[3px] w-6" },
  { h: "s", cls: "left-1/2 bottom-0 h-8 w-12 -translate-x-1/2 translate-y-1/2 cursor-ns-resize", bar: "h-[3px] w-6" },
  { h: "w", cls: "left-0 top-1/2 h-12 w-8 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize", bar: "h-6 w-[3px]" },
  { h: "e", cls: "right-0 top-1/2 h-12 w-8 translate-x-1/2 -translate-y-1/2 cursor-ew-resize", bar: "h-6 w-[3px]" },
];

export function CropOverlay() {
  const geometry = useEditor((s) => s.edit.geometry);
  useEditor((s) => s.view);
  useEditor((s) => s.viewport);
  const setEdit = useEditor((s) => s.setEdit);
  const commit = useEditor((s) => s.commit);
  const drag = useRef<{ id: number; handle: Handle; x0: number; y0: number; crop0: CropRect } | null>(null);
  const [dragging, setDragging] = useState(false);

  const scene = sceneFromState();
  if (!scene) return null;
  const { layout } = scene;
  const W = layout.contentW;
  const H = layout.contentH;
  const fx = layout.originX;
  const fy = layout.originY;
  const fw = W * layout.scale;
  const fh = H * layout.scale;
  const c = geometry.crop;
  const left = fx + c.x * fw;
  const top = fy + c.y * fh;
  const width = c.w * fw;
  const height = c.h * fh;
  const ratio = geometry.aspect ? (geometry.aspect * H) / W : null;

  const onDown = (e: React.PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const handle = (e.currentTarget.dataset.handle ?? "move") as Handle;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, handle, x0: e.clientX, y0: e.clientY, crop0: geometry.crop };
    setDragging(true);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const crop = computeCrop(d.handle, d.crop0, (e.clientX - d.x0) / fw, (e.clientY - d.y0) / fh, ratio);
    setEdit((ed) => ({ ...ed, geometry: { ...ed.geometry, crop } }));
  };

  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    commit();
  };

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg className="absolute inset-0 size-full">
        <path
          d={`M${fx},${fy}h${fw}v${fh}h${-fw}Z M${left},${top}v${height}h${width}v${-height}Z`}
          fill="rgba(0,0,0,0.62)"
          fillRule="evenodd"
        />
      </svg>
      <div
        className="pointer-events-auto absolute cursor-move touch-none"
        style={{ left, top, width, height }}
        data-handle="move"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div className="absolute inset-0 border border-white/85 shadow-[0_0_0_1px_rgba(0,0,0,.35)]" />
        <div className={`absolute inset-0 transition-opacity ${dragging ? "opacity-100" : "opacity-45"}`}>
          {[1 / 3, 2 / 3].map((v) => (
            <div key={`v${v}`} className="absolute inset-y-0 w-px bg-white/70" style={{ left: `${v * 100}%` }} />
          ))}
          {[1 / 3, 2 / 3].map((v) => (
            <div key={`h${v}`} className="absolute inset-x-0 h-px bg-white/70" style={{ top: `${v * 100}%` }} />
          ))}
        </div>
        {CORNERS.map((k) => (
          <div key={k.h} className={`absolute size-10 touch-none ${k.cls}`} data-handle={k.h} onPointerDown={onDown}>
            <span className={`absolute size-4 border-white ${k.mark}`} />
          </div>
        ))}
        {ratio === null &&
          EDGES.map((k) => (
            <div key={k.h} className={`absolute flex touch-none items-center justify-center ${k.cls}`} data-handle={k.h} onPointerDown={onDown}>
              <span className={`rounded-full bg-white ${k.bar}`} />
            </div>
          ))}
        {dragging && (
          <span className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded bg-black/70 px-2 py-0.5 font-mono text-[11px] text-white">
            {Math.round(c.w * W)} × {Math.round(c.h * H)}
          </span>
        )}
      </div>
    </div>
  );
}
