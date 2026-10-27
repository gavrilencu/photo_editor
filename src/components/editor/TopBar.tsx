"use client";

import { ChartNoAxesColumn, Columns2, Download, Eye, ImagePlus, Redo2, RotateCcw, Undo2 } from "lucide-react";
import { IconButton } from "@/components/ui/controls";
import { promptOpenImage } from "@/lib/editor/actions";
import { useEditor } from "@/lib/editor/store";

export function TopBar() {
  const image = useEditor((s) => s.image);
  const canUndo = useEditor((s) => s.past.length > 0 || s.edit !== s.committed);
  const canRedo = useEditor((s) => s.future.length > 0);
  const compare = useEditor((s) => s.compare);
  const hold = useEditor((s) => s.holdOriginal);
  const showHistogram = useEditor((s) => s.showHistogram);
  const tool = useEditor((s) => s.tool);
  const { undo, redo, set, resetEdits } = useEditor.getState();

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-panel px-2 pt-[env(safe-area-inset-top)] md:h-14 md:px-3">
      <div className="mr-2 hidden items-center gap-2 md:flex">
        <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-[#a66dff] text-sm font-bold text-white">
          F
        </span>
        <span className="text-sm font-semibold tracking-tight">Fotolab</span>
      </div>

      <IconButton label="Deschide imagine (Ctrl+O)" onClick={promptOpenImage}>
        <ImagePlus className="size-5" />
      </IconButton>

      {image && (
        <>
          <div className="mx-1 h-6 w-px bg-line" />
          <IconButton label="Anulează (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
            <Undo2 className="size-5" />
          </IconButton>
          <IconButton label="Refă (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>
            <Redo2 className="size-5" />
          </IconButton>
          <span className="ml-2 hidden max-w-[28ch] truncate text-xs text-faint lg:inline">
            {image.name} · {image.width}×{image.height}
          </span>
        </>
      )}

      <div className="flex-1" />

      {image && (
        <>
          <IconButton
            label="Ține apăsat pentru original (\)"
            active={hold}
            disabled={tool === "crop"}
            onPointerDown={() => set({ holdOriginal: true })}
            onPointerUp={() => set({ holdOriginal: false })}
          >
            <Eye className="size-5" />
          </IconButton>
          <IconButton label="Comparare înainte/după" active={compare} disabled={tool === "crop"} onClick={() => set({ compare: !compare })}>
            <Columns2 className="size-5" />
          </IconButton>
          <IconButton
            label="Histogramă"
            active={showHistogram}
            className="hidden md:flex"
            onClick={() => set({ showHistogram: !showHistogram })}
          >
            <ChartNoAxesColumn className="size-5" />
          </IconButton>
          <IconButton label="Resetează toate ajustările" onClick={resetEdits}>
            <RotateCcw className="size-5" />
          </IconButton>
          <button
            type="button"
            onClick={() => set({ exportOpen: true })}
            aria-label="Exportă"
            title="Exportă (Ctrl+S)"
            className="ml-1 inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-medium text-white hover:bg-accent-strong"
          >
            <Download className="size-4" />
            <span className="hidden sm:inline">Exportă</span>
          </button>
        </>
      )}
    </header>
  );
}
