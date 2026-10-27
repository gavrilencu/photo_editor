"use client";

import { WandSparkles } from "lucide-react";
import { Button, Section } from "@/components/ui/controls";
import { autoEnhance } from "@/lib/editor/actions";
import type { AdjustKey } from "@/lib/editor/types";
import { AdjSlider, resetAdj } from "../AdjSlider";

const LIGHT: AdjustKey[] = ["exposure", "contrast", "highlights", "shadows", "whites", "blacks"];

export function LightPanel() {
  return (
    <>
      <Section
        title="Lumină"
        onReset={() => resetAdj(LIGHT)}
        right={
          <Button variant="ghost" className="min-h-7 px-2 text-xs" onClick={autoEnhance} title="Îmbunătățire automată">
            <WandSparkles className="size-3.5" /> Auto
          </Button>
        }
      >
        {LIGHT.map((k) => (
          <AdjSlider key={k} k={k} />
        ))}
      </Section>
    </>
  );
}
