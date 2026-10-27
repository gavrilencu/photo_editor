"use client";

import { useMemo, useRef, useState } from "react";
import { Button, Section, Segmented } from "@/components/ui/controls";
import { DEFAULT_CURVES, IDENTITY_CURVE } from "@/lib/editor/defaults";
import { useEditor } from "@/lib/editor/store";
import type { CurveChannel, CurvePoint } from "@/lib/editor/types";
import { makeCurveFn } from "@/lib/engine/curves";
import { HistogramView } from "../Histogram";

const CHANNEL_COLOR: Record<CurveChannel, string> = {
  master: "#e8e8ee",
  r: "#ff5a5a",
  g: "#4ade80",
  b: "#5b8cff",
};

const QUICK: { name: string; points: CurvePoint[] }[] = [
  { name: "Liniar", points: IDENTITY_CURVE },
  {
    name: "Contrast",
    points: [
      [0, 0],
      [0.25, 0.2],
      [0.75, 0.8],
      [1, 1],
    ],
  },
  {
    name: "Puternic",
    points: [
      [0, 0],
      [0.25, 0.14],
      [0.75, 0.87],
      [1, 1],
    ],
  },
  {
    name: "Mat",
    points: [
      [0, 0.1],
      [0.3, 0.3],
      [0.75, 0.78],
      [1, 0.94],
    ],
  },
  {
    name: "Luminos",
    points: [
      [0, 0],
      [0.45, 0.58],
      [1, 1],
    ],
  },
];

const HIT_PX = 22;
const MIN_GAP = 0.02;

function CurveEditor({ channel }: { channel: CurveChannel }) {
  const points = useEditor((s) => s.edit.curves[channel]);
  const setEdit = useEditor((s) => s.setEdit);
  const commit = useEditor((s) => s.commit);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: number; index: number } | null>(null);
  const lastTap = useRef<{ t: number; index: number }>({ t: 0, index: -1 });

  const path = useMemo(() => {
    const f = makeCurveFn(points);
    let d = "";
    for (let i = 0; i <= 128; i++) {
      const x = i / 128;
      d += `${i ? "L" : "M"}${x.toFixed(4)},${(1 - f(x)).toFixed(4)}`;
    }
    return d;
  }, [points]);

  const setPoints = (pts: CurvePoint[]) => setEdit((e) => ({ ...e, curves: { ...e.curves, [channel]: pts } }));

  const toLocal = (e: React.PointerEvent): [number, number] => {
    const r = svgRef.current!.getBoundingClientRect();
    return [
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height)),
    ];
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const [x, y] = toLocal(e);
    let index = -1;
    let best = Infinity;
    points.forEach(([px, py], i) => {
      const d = Math.hypot((px - x) * r.width, (py - y) * r.height);
      if (d < best) {
        best = d;
        index = i;
      }
    });
    const hit = (e.pointerType === "mouse" ? HIT_PX * 0.6 : HIT_PX);
    if (best > hit) {
      // punct nou, inserat în ordine
      const pts = [...points, [x, y] as CurvePoint].sort((a, b) => a[0] - b[0]);
      index = pts.findIndex((p) => p[0] === x && p[1] === y);
      const prev = pts[index - 1];
      const next = pts[index + 1];
      if ((prev && x - prev[0] < MIN_GAP) || (next && next[0] - x < MIN_GAP)) return;
      setPoints(pts);
    } else {
      // dublu-tap pe un punct interior = ștergere
      const now = performance.now();
      if (lastTap.current.index === index && now - lastTap.current.t < 320 && index > 0 && index < points.length - 1) {
        setPoints(points.filter((_, i) => i !== index));
        commit();
        lastTap.current = { t: 0, index: -1 };
        return;
      }
      lastTap.current = { t: now, index };
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, index };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const [x, y] = toLocal(e);
    const pts = useEditor.getState().edit.curves[channel];
    const i = d.index;
    const last = pts.length - 1;
    const lo = i === 0 ? 0 : pts[i - 1][0] + MIN_GAP;
    const hi = i === last ? 1 : pts[i + 1][0] - MIN_GAP;
    const nx = Math.min(hi, Math.max(lo, x));
    setPoints(pts.map((p, j) => (j === i ? ([nx, y] as CurvePoint) : p)));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    commit();
  };

  const color = CHANNEL_COLOR[channel];

  return (
    <div className="relative aspect-square w-full max-w-[300px] self-center rounded-lg bg-[#0b0b0e] ring-1 ring-line">
      <HistogramView
        mode={channel === "master" ? "luma" : channel}
        className="pointer-events-none absolute inset-0 size-full rounded-lg"
      />
      <svg
        ref={svgRef}
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {[0.25, 0.5, 0.75].map((v) => (
          <g key={v} stroke="rgba(255,255,255,0.07)" strokeWidth={1} vectorEffect="non-scaling-stroke">
            <line x1={v} y1={0} x2={v} y2={1} vectorEffect="non-scaling-stroke" />
            <line x1={0} y1={v} x2={1} y2={v} vectorEffect="non-scaling-stroke" />
          </g>
        ))}
        <line x1={0} y1={1} x2={1} y2={0} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <path d={path} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      {points.map(([x, y], i) => (
        <div
          key={i}
          className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-bg"
          style={{ left: `${x * 100}%`, top: `${(1 - y) * 100}%`, borderColor: color }}
        />
      ))}
    </div>
  );
}

export function CurvesPanel() {
  const [channel, setChannel] = useState<CurveChannel>("master");
  const apply = useEditor((s) => s.apply);

  const dot = (c: CurveChannel, label: string) => (
    <span className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-full" style={{ background: CHANNEL_COLOR[c] }} />
      {label}
    </span>
  );

  return (
    <Section title="Curbe de ton" onReset={() => apply((e) => ({ ...e, curves: DEFAULT_CURVES }))}>
      <Segmented<CurveChannel>
        className="mb-3"
        value={channel}
        onChange={setChannel}
        options={[
          { value: "master", label: dot("master", "RGB") },
          { value: "r", label: dot("r", "R") },
          { value: "g", label: dot("g", "G") },
          { value: "b", label: dot("b", "B") },
        ]}
      />
      <div className="flex flex-col">
        <CurveEditor channel={channel} />
      </div>
      <p className="pt-2 text-xs text-faint">Atinge curba pentru a adăuga un punct, trage-l pentru a ajusta. Dublu-tap pe un punct îl șterge.</p>
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pt-2">
        {QUICK.map((q) => (
          <Button
            key={q.name}
            variant="secondary"
            className="min-h-8 shrink-0 px-3 text-xs"
            onClick={() => apply((e) => ({ ...e, curves: { ...e.curves, [channel]: q.points } }))}
          >
            {q.name}
          </Button>
        ))}
      </div>
    </Section>
  );
}
