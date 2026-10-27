"use client";

import { FileUp, WandSparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Section } from "@/components/ui/controls";
import { Slider } from "@/components/ui/Slider";
import { autoEnhance, importLut, type PresetThumb, renderPresetThumbs } from "@/lib/editor/actions";
import { applyPreset, PRESETS } from "@/lib/editor/presets";
import { useEditor } from "@/lib/editor/store";

function usePresetThumbs(): PresetThumb[] {
  const version = useEditor((s) => s.image?.version);
  const geometry = useEditor((s) => s.committed.geometry);
  const [thumbs, setThumbs] = useState<PresetThumb[]>([]);
  useEffect(() => {
    // rendererul poate să nu fie gata imediat după încărcare: reîncercăm
    let tries = 0;
    let t: ReturnType<typeof setTimeout>;
    const run = () => {
      const res = renderPresetThumbs();
      if (res.length || tries++ > 20) setThumbs(res);
      else t = setTimeout(run, 150);
    };
    t = setTimeout(run, 60);
    return () => clearTimeout(t);
  }, [version, geometry]);
  return thumbs;
}

function PresetGrid() {
  const thumbs = usePresetThumbs();
  const preset = useEditor((s) => s.edit.preset);
  const apply = useEditor((s) => s.apply);
  const activeId = preset?.id ?? null;

  const choose = (id: string | null) => {
    const p = PRESETS.find((x) => x.id === id) ?? null;
    apply((e) => applyPreset(e, p, 100));
  };

  const items = thumbs.length
    ? thumbs
    : [{ id: null, name: "Original", url: "" }, ...PRESETS.map((p) => ({ id: p.id, name: p.name, url: "" }))];

  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
      {items.map((t) => {
        const active = t.id === activeId;
        return (
          <button
            key={t.id ?? "none"}
            type="button"
            onClick={() => choose(t.id)}
            className="group flex w-[68px] shrink-0 flex-col items-center gap-1 md:w-auto"
          >
            <span
              className={`relative block aspect-square w-full overflow-hidden rounded-lg bg-panel-3 ring-2 transition ${
                active ? "ring-accent" : "ring-transparent group-hover:ring-white/20"
              }`}
            >
              {t.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.url} alt="" className="size-full object-cover" draggable={false} />
              )}
            </span>
            <span className={`w-full truncate text-center text-[11px] ${active ? "text-fg" : "text-muted"}`}>{t.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function PresetAmount() {
  const preset = useEditor((s) => s.edit.preset);
  const setEdit = useEditor((s) => s.setEdit);
  const commit = useEditor((s) => s.commit);
  if (!preset) return null;
  const p = PRESETS.find((x) => x.id === preset.id);
  if (!p) return null;
  return (
    <Slider
      label={`Intensitate „${p.name}”`}
      value={preset.amount}
      min={0}
      max={150}
      step={1}
      def={100}
      onChange={(v) => setEdit((e) => applyPreset(e, p, v))}
      onCommit={commit}
    />
  );
}

function LutSection() {
  const luts = useEditor((s) => s.luts);
  const lut = useEditor((s) => s.edit.lut);
  const setEdit = useEditor((s) => s.setEdit);
  const apply = useEditor((s) => s.apply);
  const commit = useEditor((s) => s.commit);

  return (
    <Section
      title="LUT 3D (.cube)"
      right={
        <Button variant="ghost" className="min-h-7 px-2 text-xs" onClick={importLut}>
          <FileUp className="size-3.5" /> Importă
        </Button>
      }
    >
      {luts.length === 0 ? (
        <p className="text-xs leading-relaxed text-faint">
          Importă LUT-uri de film sau de cinema (format .cube, de ex. din Lightroom, DaVinci Resolve sau Photoshop).
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {luts.map((l) => {
            const active = lut?.id === l.id;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => apply((e) => ({ ...e, lut: active ? null : { id: l.id, amount: 100 } }))}
                className={`flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs ${
                  active ? "bg-accent text-white" : "bg-panel-3 text-muted hover:text-fg"
                }`}
              >
                {l.name}
                {active && <X className="size-3" />}
              </button>
            );
          })}
        </div>
      )}
      {lut && (
        <Slider
          label="Intensitate LUT"
          value={lut.amount}
          min={0}
          max={100}
          step={1}
          def={100}
          onChange={(v) => setEdit((e) => ({ ...e, lut: e.lut ? { ...e.lut, amount: v } : null }))}
          onCommit={commit}
        />
      )}
    </Section>
  );
}

export function FiltersPanel() {
  return (
    <>
      <Section
        title="Filtre"
        right={
          <Button variant="ghost" className="min-h-7 px-2 text-xs" onClick={autoEnhance} title="Îmbunătățire automată">
            <WandSparkles className="size-3.5" /> Auto
          </Button>
        }
      >
        <PresetGrid />
        <PresetAmount />
      </Section>
      <LutSection />
    </>
  );
}
