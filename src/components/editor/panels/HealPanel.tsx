"use client";

import { Eraser, Trash2 } from "lucide-react";
import { Button, Section, Toggle } from "@/components/ui/controls";
import { Slider } from "@/components/ui/Slider";
import { applyHeal } from "@/lib/editor/actions";
import { useEditor } from "@/lib/editor/store";

export function HealPanel() {
  const brushSize = useEditor((s) => s.brushSize);
  const autoHeal = useEditor((s) => s.autoHeal);
  const strokes = useEditor((s) => s.strokes);
  const busy = useEditor((s) => s.busy);
  const healCount = useEditor((s) => s.edit.healCount);
  const set = useEditor((s) => s.set);

  return (
    <Section title="Ștergere obiecte">
      <p className="pb-1 text-xs leading-relaxed text-muted">
        Pictează peste obiectul, persoana sau defectul pe care vrei să-l elimini. Zona va fi reconstruită din
        texturile din jur.
      </p>
      <Slider
        label="Mărime pensulă"
        value={brushSize}
        min={8}
        max={200}
        step={1}
        def={48}
        format={(v) => `${Math.round(v)} px`}
        onChange={(v) => set({ brushSize: v })}
        onCommit={() => {}}
      />
      <Toggle label="Elimină automat la ridicarea degetului" checked={autoHeal} onChange={(v) => set({ autoHeal: v })} />
      {!autoHeal && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button variant="primary" onClick={applyHeal} disabled={!strokes.length || !!busy}>
            <Eraser className="size-4" /> Elimină
          </Button>
          <Button onClick={() => set({ strokes: [] })} disabled={!strokes.length || !!busy}>
            <Trash2 className="size-4" /> Golește
          </Button>
        </div>
      )}
      {healCount > 0 && (
        <p className="pt-1 text-xs text-faint">
          {healCount} {healCount === 1 ? "zonă eliminată" : "zone eliminate"} · folosește Anulare pentru a reveni
        </p>
      )}
    </Section>
  );
}
