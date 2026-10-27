"use client";

import { useEditor } from "@/lib/editor/store";
import { ColorPanel } from "./panels/ColorPanel";
import { CropPanel } from "./panels/CropPanel";
import { CurvesPanel } from "./panels/CurvesPanel";
import { EffectsPanel } from "./panels/EffectsPanel";
import { FiltersPanel } from "./panels/FiltersPanel";
import { HealPanel } from "./panels/HealPanel";
import { LightPanel } from "./panels/LightPanel";

export function Panel() {
  const tool = useEditor((s) => s.tool);
  return (
    <aside className="scroll-thin max-h-[42dvh] shrink-0 overflow-y-auto overscroll-contain border-t border-line bg-panel md:max-h-none md:w-[340px] md:border-l md:border-t-0">
      {tool === "filters" && <FiltersPanel />}
      {tool === "light" && <LightPanel />}
      {tool === "color" && <ColorPanel />}
      {tool === "curves" && <CurvesPanel />}
      {tool === "effects" && <EffectsPanel />}
      {tool === "crop" && <CropPanel />}
      {tool === "heal" && <HealPanel />}
    </aside>
  );
}
