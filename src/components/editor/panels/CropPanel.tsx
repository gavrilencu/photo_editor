"use client";

import { FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from "lucide-react";
import { Button, Section } from "@/components/ui/controls";
import { Slider } from "@/components/ui/Slider";
import { DEFAULT_GEOMETRY } from "@/lib/editor/defaults";
import { useEditor } from "@/lib/editor/store";
import { fitAspect, flipGeometry, orientedSize, rotateGeometryCCW, rotateGeometryCW } from "@/lib/engine/geometry";

const RATIOS: { label: string; value: number | "free" | "orig" }[] = [
  { label: "Liber", value: "free" },
  { label: "Original", value: "orig" },
  { label: "1:1", value: 1 },
  { label: "4:5", value: 4 / 5 },
  { label: "5:4", value: 5 / 4 },
  { label: "3:4", value: 3 / 4 },
  { label: "4:3", value: 4 / 3 },
  { label: "2:3", value: 2 / 3 },
  { label: "3:2", value: 3 / 2 },
  { label: "9:16", value: 9 / 16 },
  { label: "16:9", value: 16 / 9 },
];

export function CropPanel() {
  const geometry = useEditor((s) => s.edit.geometry);
  const image = useEditor((s) => s.image);
  const apply = useEditor((s) => s.apply);
  const setEdit = useEditor((s) => s.setEdit);
  const commit = useEditor((s) => s.commit);
  if (!image) return null;

  const [W, H] = orientedSize(image.width, image.height, geometry.rotation);
  const origAspect = W / H;

  const isActive = (v: number | "free" | "orig") => {
    if (v === "free") return geometry.aspect === null;
    const a = v === "orig" ? origAspect : v;
    return geometry.aspect !== null && Math.abs(geometry.aspect - a) < 1e-3;
  };

  const setRatio = (v: number | "free" | "orig") =>
    apply((e) => {
      const g = e.geometry;
      if (v === "free") return { ...e, geometry: { ...g, aspect: null } };
      const a = v === "orig" ? origAspect : v;
      const c = g.crop;
      return {
        ...e,
        geometry: { ...g, aspect: a, crop: fitAspect(a, W, H, [c.x + c.w / 2, c.y + c.h / 2]) },
      };
    });

  return (
    <>
      <Section title="Proporție">
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          {RATIOS.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setRatio(r.value)}
              className={`min-h-8 shrink-0 rounded-full px-3 text-xs font-medium transition-colors ${
                isActive(r.value) ? "bg-accent text-white" : "bg-panel-3 text-muted hover:text-fg"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Îndreptare și rotire" onReset={() => apply((e) => ({ ...e, geometry: DEFAULT_GEOMETRY }))}>
        <Slider
          label="Unghi"
          value={geometry.angle}
          min={-45}
          max={45}
          step={0.1}
          def={0}
          format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}°`}
          onChange={(v) => setEdit((e) => ({ ...e, geometry: { ...e.geometry, angle: v } }))}
          onCommit={commit}
        />
        <div className="grid grid-cols-4 gap-1.5 pt-1">
          <Button title="Rotește la stânga" onClick={() => apply((e) => ({ ...e, geometry: rotateGeometryCCW(e.geometry) }))}>
            <RotateCcw className="size-4" />
          </Button>
          <Button title="Rotește la dreapta" onClick={() => apply((e) => ({ ...e, geometry: rotateGeometryCW(e.geometry) }))}>
            <RotateCw className="size-4" />
          </Button>
          <Button title="Oglindire orizontală" onClick={() => apply((e) => ({ ...e, geometry: flipGeometry(e.geometry, "h") }))}>
            <FlipHorizontal2 className="size-4" />
          </Button>
          <Button title="Oglindire verticală" onClick={() => apply((e) => ({ ...e, geometry: flipGeometry(e.geometry, "v") }))}>
            <FlipVertical2 className="size-4" />
          </Button>
        </div>
      </Section>
    </>
  );
}
