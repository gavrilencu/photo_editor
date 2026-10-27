"use client";

import { useRef } from "react";

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  def: number;
  onChange: (v: number) => void;
  onCommit: () => void;
  /** Fundal CSS pentru pistă (ex. gradient de culoare). */
  track?: string;
  format?: (v: number) => string;
  disabled?: boolean;
}

const DOUBLE_TAP_MS = 300;

/**
 * Slider optimizat pentru touch: pe mobil se trage relativ (nu sare la
 * punctul atins, ca să nu se încurce cu derularea), pe desktop click-ul
 * sare direct la valoare. Dublu-tap / dublu-click resetează.
 */
export function Slider({ label, value, min, max, step, def, onChange, onCommit, track, format, disabled }: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; startX: number; startValue: number; moved: boolean; mouse: boolean } | null>(null);
  const lastTap = useRef(0);

  const range = max - min;
  const snap = (v: number) => {
    const s = Math.round((v - min) / step) * step + min;
    const clamped = Math.min(max, Math.max(min, s));
    return Number(clamped.toFixed(4));
  };
  const pct = ((value - min) / range) * 100;
  const zeroPct = ((Math.min(max, Math.max(min, 0)) - min) / range) * 100;
  const bipolar = min < 0 && max > 0;

  const valueFromX = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    return snap(min + ((clientX - r.left) / r.width) * range);
  };

  const reset = () => {
    if (value !== def) {
      onChange(def);
      onCommit();
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    const mouse = e.pointerType === "mouse";
    if (mouse && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, startX: e.clientX, startValue: value, moved: false, mouse };
    if (mouse) onChange(valueFromX(e.clientX));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (Math.abs(e.clientX - d.startX) > 3) d.moved = true;
    if (d.mouse) {
      onChange(valueFromX(e.clientX));
    } else if (d.moved) {
      const w = trackRef.current!.getBoundingClientRect().width;
      onChange(snap(d.startValue + ((e.clientX - d.startX) / w) * range));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.mouse && !d.moved) {
      const now = performance.now();
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        lastTap.current = 0;
        reset();
        return;
      }
      lastTap.current = now;
    }
    onCommit();
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    // browserul a preluat gestul (derulare): revenim la valoarea inițială
    onChange(d.startValue);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const mult = e.shiftKey ? 10 : 1;
    let v: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") v = snap(value + step * mult);
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") v = snap(value - step * mult);
    if (e.key === "Home") v = min;
    if (e.key === "End") v = max;
    if (e.key === "Backspace" || e.key === "Delete") v = def;
    if (v !== null) {
      e.preventDefault();
      onChange(v);
      onCommit();
    }
  };

  const fillLeft = bipolar ? Math.min(pct, zeroPct) : 0;
  const fillWidth = bipolar ? Math.abs(pct - zeroPct) : pct;
  const changed = Math.abs(value - def) > 1e-9;

  return (
    <div className={`select-none ${disabled ? "opacity-40" : ""}`}>
      <div className="flex items-baseline justify-between gap-2 text-[13px] leading-5">
        <button
          type="button"
          className={`truncate text-left ${changed ? "text-fg" : "text-muted"}`}
          onDoubleClick={reset}
          title="Dublu-click pentru resetare"
        >
          {label}
        </button>
        <span className={`font-mono text-xs tabular-nums ${changed ? "text-accent" : "text-faint"}`}>
          {format ? format(value) : Math.round(value)}
        </span>
      </div>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        className="relative h-7 cursor-pointer touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onDoubleClick={reset}
        onKeyDown={onKeyDown}
      >
        <div
          className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-panel-3"
          style={track ? { background: track, height: 4 } : undefined}
        />
        {!track && (
          <div
            className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-accent"
            style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
          />
        )}
        {bipolar && <div className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-faint" style={{ left: `${zeroPct}%` }} />}
        <div
          className="absolute top-1/2 size-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-fg shadow-[0_1px_4px_rgba(0,0,0,.6)]"
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}
