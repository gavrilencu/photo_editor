"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { openImageFile, promptOpenImage } from "@/lib/editor/actions";
import { editorDoc } from "@/lib/editor/document";
import { useEditor } from "@/lib/editor/store";
import { ExportDialog } from "./ExportDialog";
import { Panel } from "./Panel";
import { StartScreen } from "./StartScreen";
import { ToolRail, ToolTabs } from "./ToolNav";
import { TopBar } from "./TopBar";
import { Viewport } from "./Viewport";

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

function useShortcuts() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const s = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && key === "y") {
        e.preventDefault();
        s.redo();
      } else if (mod && key === "o") {
        e.preventDefault();
        void promptOpenImage();
      } else if (mod && (key === "s" || key === "e")) {
        e.preventDefault();
        if (s.image) s.set({ exportOpen: true });
      } else if (e.key === "\\" && !e.repeat && s.image) {
        s.set({ holdOriginal: true });
      } else if (!mod && e.key === "0" && s.image) {
        s.resetView();
      } else if (e.key === "Escape" && s.exportOpen) {
        s.set({ exportOpen: false });
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "\\") useEditor.getState().set({ holdOriginal: false });
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
}

/** Trage-și-plasează + lipire din clipboard. */
function useFileInput() {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) void openImageFile(file);
    };
    const paste = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return;
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file) {
        e.preventDefault();
        void openImageFile(file);
      }
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    window.addEventListener("paste", paste);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
      window.removeEventListener("paste", paste);
    };
  }, []);
  return dragging;
}

/** Undo/redo pentru retuș: pixelii sursă urmează `healCount` din istoric. */
function useHealSync() {
  const healCount = useEditor((s) => s.edit.healCount);
  useEffect(() => {
    if (editorDoc.syncHeal(healCount)) useEditor.getState().bumpImageVersion();
  }, [healCount]);
}

function Toast() {
  const toast = useEditor((s) => s.toast);
  if (!toast) return null;
  return (
    <div
      role="status"
      className="animate-fade-up pointer-events-none fixed bottom-[calc(8.5rem+env(safe-area-inset-bottom))] left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-xl bg-[#2a2a33] px-4 py-2.5 text-center text-sm text-fg shadow-xl ring-1 ring-white/10 md:bottom-8"
    >
      {toast}
    </div>
  );
}

function BusyOverlay() {
  const busy = useEditor((s) => s.busy);
  if (!busy) return null;
  return (
    <div className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-black/25">
      <div className="flex items-center gap-3 rounded-xl bg-panel/95 px-4 py-3 text-sm shadow-2xl ring-1 ring-line">
        <LoaderCircle className="size-5 animate-spin text-accent" />
        {busy}
      </div>
    </div>
  );
}

export default function Editor() {
  const hasImage = useEditor((s) => !!s.image);
  const dragging = useFileInput();
  useShortcuts();
  useHealSync();

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg text-fg select-none">
      <TopBar />
      {hasImage ? (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <ToolRail />
          <main className="relative min-h-0 min-w-0 flex-1">
            <Viewport />
            {dragging && (
              <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent/10 text-sm font-medium text-accent">
                Plasează imaginea pentru a o deschide
              </div>
            )}
          </main>
          <Panel />
          <ToolTabs />
        </div>
      ) : (
        <StartScreen dragging={dragging} />
      )}
      <ExportDialog />
      <BusyOverlay />
      <Toast />
    </div>
  );
}
