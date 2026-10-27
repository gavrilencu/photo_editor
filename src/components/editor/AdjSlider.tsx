"use client";

import { Slider } from "@/components/ui/Slider";
import { ADJUST_DEFS, DEFAULT_ADJ } from "@/lib/editor/defaults";
import { useEditor } from "@/lib/editor/store";
import type { AdjustKey } from "@/lib/editor/types";

export function AdjSlider({ k, label }: { k: AdjustKey; label?: string }) {
  const value = useEditor((s) => s.edit.adj[k]);
  const setAdj = useEditor((s) => s.setAdj);
  const commit = useEditor((s) => s.commit);
  const d = ADJUST_DEFS[k];
  return (
    <Slider
      label={label ?? d.label}
      value={value}
      min={d.min}
      max={d.max}
      step={d.step}
      def={d.def}
      track={d.track}
      format={d.format}
      onChange={(v) => setAdj(k, v)}
      onCommit={commit}
    />
  );
}

/** Resetează un grup de ajustări la valorile implicite (cu intrare în istoric). */
export function resetAdj(keys: AdjustKey[]) {
  useEditor.getState().apply((e) => {
    const adj = { ...e.adj };
    for (const k of keys) adj[k] = DEFAULT_ADJ[k];
    return { ...e, adj };
  });
}
