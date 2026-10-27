"use client";

import { useRef } from "react";

/** Roată de culoare: unghiul = nuanța (0° sus, în sens orar), raza = saturația. */
export function ColorWheel({
  hue,
  sat,
  size = 168,
  onChange,
  onCommit,
}: {
  hue: number;
  sat: number;
  size?: number;
  onChange: (hue: number, sat: number) => void;
  onCommit: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);

  const update = (clientX: number, clientY: number) => {
    const r = ref.current!.getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    const rad = r.width / 2;
    const h = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    const s = Math.min(1, Math.hypot(dx, dy) / rad) * 100;
    onChange(Math.round(h), Math.round(s));
  };

  const a = (hue * Math.PI) / 180;
  const pr = (sat / 100) * (size / 2);
  const x = size / 2 + Math.sin(a) * pr;
  const y = size / 2 - Math.cos(a) * pr;

  return (
    <div
      ref={ref}
      className="relative shrink-0 cursor-crosshair touch-none rounded-full"
      style={{
        width: size,
        height: size,
        background:
          "radial-gradient(circle closest-side, #9a9aa0 0%, rgba(154,154,160,0) 100%), conic-gradient(from 0deg, #ff4d4d, #ffd84d, #6dff4d, #4dfff0, #4d6bff, #e04dff, #ff4d4d)",
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        active.current = e.pointerId;
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (active.current === e.pointerId) update(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (active.current !== e.pointerId) return;
        active.current = null;
        onCommit();
      }}
      onPointerCancel={() => {
        active.current = null;
        onCommit();
      }}
      onDoubleClick={() => {
        onChange(hue, 0);
        onCommit();
      }}
    >
      <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-black/40" />
      <div
        className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.5),0_2px_6px_rgba(0,0,0,.5)]"
        style={{ left: x, top: y }}
      />
    </div>
  );
}
