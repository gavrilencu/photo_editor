"use client";

import { Section } from "@/components/ui/controls";
import type { AdjustKey } from "@/lib/editor/types";
import { AdjSlider, resetAdj } from "../AdjSlider";

const DETAIL: AdjustKey[] = ["clarity", "dehaze", "sharpen", "denoise"];
const VIGNETTE: AdjustKey[] = ["vignette", "vignetteMidpoint", "vignetteFeather", "vignetteRoundness"];
const GRAIN: AdjustKey[] = ["grain", "grainSize", "fade"];

export function EffectsPanel() {
  return (
    <>
      <Section title="Detalii" onReset={() => resetAdj(DETAIL)}>
        {DETAIL.map((k) => (
          <AdjSlider key={k} k={k} />
        ))}
      </Section>
      <Section title="Vignetă" onReset={() => resetAdj(VIGNETTE)}>
        <AdjSlider k="vignette" label="Intensitate" />
        <AdjSlider k="vignetteMidpoint" />
        <AdjSlider k="vignetteFeather" />
        <AdjSlider k="vignetteRoundness" />
      </Section>
      <Section title="Film" onReset={() => resetAdj(GRAIN)}>
        {GRAIN.map((k) => (
          <AdjSlider key={k} k={k} />
        ))}
      </Section>
    </>
  );
}
