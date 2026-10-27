"use client";

import { useState } from "react";
import { Section, Segmented } from "@/components/ui/controls";
import { Slider } from "@/components/ui/Slider";
import { DEFAULT_GRADING, DEFAULT_HSL, HSL_BANDS } from "@/lib/editor/defaults";
import { useEditor } from "@/lib/editor/store";
import type { AdjustKey, GradeZone, HslBand } from "@/lib/editor/types";
import { AdjSlider, resetAdj } from "../AdjSlider";
import { ColorWheel } from "../ColorWheel";

const BASIC: AdjustKey[] = ["temperature", "tint", "vibrance", "saturation"];

type Mode = "basic" | "hsl" | "grading";
type HslMode = keyof HslBand;

const signed = (v: number) => (v > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`);

function hslTrack(mode: HslMode, hue: number): string {
  if (mode === "h") return `linear-gradient(90deg, hsl(${hue - 30} 85% 55%), hsl(${hue} 85% 55%), hsl(${hue + 30} 85% 55%))`;
  if (mode === "s") return `linear-gradient(90deg, hsl(${hue} 0% 55%), hsl(${hue} 95% 55%))`;
  return `linear-gradient(90deg, hsl(${hue} 70% 15%), hsl(${hue} 80% 50%), hsl(${hue} 80% 85%))`;
}

function HslSection() {
  const [mode, setMode] = useState<HslMode>("h");
  const hsl = useEditor((s) => s.edit.hsl);
  const setEdit = useEditor((s) => s.setEdit);
  const commit = useEditor((s) => s.commit);
  const apply = useEditor((s) => s.apply);

  const setBand = (i: number, v: number) =>
    setEdit((e) => ({ ...e, hsl: e.hsl.map((b, j) => (j === i ? { ...b, [mode]: v } : b)) }));

  return (
    <Section title="Mixer HSL" onReset={() => apply((e) => ({ ...e, hsl: DEFAULT_HSL }))}>
      <Segmented<HslMode>
        className="mb-2"
        value={mode}
        onChange={setMode}
        options={[
          { value: "h", label: "Nuanță" },
          { value: "s", label: "Saturație" },
          { value: "l", label: "Luminanță" },
        ]}
      />
      {HSL_BANDS.map((band, i) => (
        <Slider
          key={band.name}
          label={band.name}
          value={hsl[i][mode]}
          min={-100}
          max={100}
          step={1}
          def={0}
          track={hslTrack(mode, band.hue)}
          format={signed}
          onChange={(v) => setBand(i, v)}
          onCommit={commit}
        />
      ))}
    </Section>
  );
}

const ZONES: { value: GradeZone; label: string }[] = [
  { value: "shadows", label: "Umbre" },
  { value: "midtones", label: "Mediu" },
  { value: "highlights", label: "Lumini" },
];

function GradingSection() {
  const [zone, setZone] = useState<GradeZone>("shadows");
  const grading = useEditor((s) => s.edit.grading);
  const setEdit = useEditor((s) => s.setEdit);
  const commit = useEditor((s) => s.commit);
  const apply = useEditor((s) => s.apply);
  const w = grading[zone];

  const setWheel = (hue: number, sat: number) =>
    setEdit((e) => ({ ...e, grading: { ...e.grading, [zone]: { hue, sat } } }));

  return (
    <Section title="Color grading" onReset={() => apply((e) => ({ ...e, grading: DEFAULT_GRADING }))}>
      <Segmented<GradeZone>
        className="mb-3"
        value={zone}
        onChange={setZone}
        options={ZONES.map((z) => ({
          value: z.value,
          label: (
            <span className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-full ring-1 ring-white/20"
                style={{
                  background: grading[z.value].sat > 0 ? `hsl(${grading[z.value].hue} 80% 55%)` : "#555",
                }}
              />
              {z.label}
            </span>
          ),
        }))}
      />
      <div className="flex justify-center py-1">
        <ColorWheel hue={w.hue} sat={w.sat} onChange={setWheel} onCommit={commit} />
      </div>
      <Slider
        label="Nuanță"
        value={w.hue}
        min={0}
        max={360}
        step={1}
        def={DEFAULT_GRADING[zone].hue}
        track="linear-gradient(90deg,#ff4d4d,#ffd84d,#6dff4d,#4dfff0,#4d6bff,#e04dff,#ff4d4d)"
        format={(v) => `${Math.round(v)}°`}
        onChange={(v) => setWheel(v, w.sat)}
        onCommit={commit}
      />
      <Slider
        label="Saturație"
        value={w.sat}
        min={0}
        max={100}
        step={1}
        def={0}
        track={`linear-gradient(90deg, #777, hsl(${w.hue} 85% 55%))`}
        onChange={(v) => setWheel(w.hue, v)}
        onCommit={commit}
      />
      <Slider
        label="Echilibru"
        value={grading.balance}
        min={-100}
        max={100}
        step={1}
        def={0}
        format={signed}
        onChange={(v) => setEdit((e) => ({ ...e, grading: { ...e.grading, balance: v } }))}
        onCommit={commit}
      />
    </Section>
  );
}

export function ColorPanel() {
  const [mode, setMode] = useState<Mode>("basic");
  return (
    <>
      <div className="sticky top-0 z-10 border-b border-line bg-panel px-4 py-2.5">
        <Segmented<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { value: "basic", label: "Bază" },
            { value: "hsl", label: "HSL" },
            { value: "grading", label: "Grading" },
          ]}
        />
      </div>
      {mode === "basic" && (
        <Section title="Balans de alb și culoare" onReset={() => resetAdj(BASIC)}>
          {BASIC.map((k) => (
            <AdjSlider key={k} k={k} />
          ))}
        </Section>
      )}
      {mode === "hsl" && <HslSection />}
      {mode === "grading" && <GradingSection />}
    </>
  );
}
