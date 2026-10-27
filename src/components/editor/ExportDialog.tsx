"use client";

import { Download, LoaderCircle, Share2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Segmented } from "@/components/ui/controls";
import { Slider } from "@/components/ui/Slider";
import { downloadFile, exportImage, type ExportFormat, type ExportResult, shareFile } from "@/lib/editor/actions";
import { useEditor } from "@/lib/editor/store";
import { finalSize } from "@/lib/editor/view";

const SCALES = [
  { value: "1", label: "100%" },
  { value: "0.75", label: "75%" },
  { value: "0.5", label: "50%" },
  { value: "0.25", label: "25%" },
] as const;

type ScaleValue = (typeof SCALES)[number]["value"];

const fmtSize = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

export function ExportDialog() {
  const open = useEditor((s) => s.exportOpen);
  const image = useEditor((s) => s.image);
  const geometry = useEditor((s) => s.edit.geometry);
  const set = useEditor((s) => s.set);

  const [format, setFormat] = useState<ExportFormat>("image/jpeg");
  const [quality, setQuality] = useState(92);
  const [scale, setScale] = useState<ScaleValue>("1");
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<(ExportResult & { url: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- detecție de capabilități în browser
    setCanShare(typeof navigator !== "undefined" && "canShare" in navigator);
  }, []);

  // orice schimbare de opțiuni invalidează rezultatul anterior
  useEffect(() => {
    return () => {
      if (result) URL.revokeObjectURL(result.url);
    };
  }, [result]);

  if (!open || !image) return null;

  const [fw, fh] = finalSize(image.width, image.height, geometry);
  const k = Number(scale);
  const outW = Math.max(1, Math.round(fw * k));
  const outH = Math.max(1, Math.round(fh * k));

  const close = () => {
    setResult(null);
    setError(null);
    set({ exportOpen: false });
  };

  const changeOption = (fn: () => void) => {
    fn();
    setResult(null);
    setError(null);
  };

  const run = async () => {
    setWorking(true);
    setError(null);
    // lasă UI-ul să afișeze indicatorul înainte de munca grea pe GPU
    await new Promise((r) => setTimeout(r, 30));
    try {
      const res = await exportImage(format, quality / 100, k);
      setResult({ ...res, url: URL.createObjectURL(res.blob) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Exportă imaginea"
        className="w-full max-w-md rounded-t-2xl border border-line bg-panel p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl md:rounded-2xl md:pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Exportă imaginea</h2>
          <button type="button" onClick={close} className="rounded-lg p-1.5 text-muted hover:bg-panel-3 hover:text-fg" aria-label="Închide">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-xs text-muted">Format</div>
            <Segmented<ExportFormat>
              value={format}
              onChange={(v) => changeOption(() => setFormat(v))}
              options={[
                { value: "image/jpeg", label: "JPEG" },
                { value: "image/png", label: "PNG" },
                { value: "image/webp", label: "WebP" },
              ]}
            />
          </div>

          {format !== "image/png" && (
            <Slider
              label="Calitate"
              value={quality}
              min={40}
              max={100}
              step={1}
              def={92}
              onChange={(v) => changeOption(() => setQuality(v))}
              onCommit={() => {}}
            />
          )}

          <div>
            <div className="mb-1.5 flex justify-between text-xs text-muted">
              <span>Dimensiune</span>
              <span className="font-mono text-faint">
                {outW} × {outH} px
              </span>
            </div>
            <Segmented<ScaleValue> value={scale} onChange={(v) => changeOption(() => setScale(v))} options={[...SCALES]} />
          </div>

          {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

          {result ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg bg-panel-2 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={result.url} alt="Previzualizare export" className="size-14 rounded object-cover" />
                <div className="min-w-0 text-xs">
                  <div className="truncate font-medium text-fg">{result.filename}</div>
                  <div className="text-faint">
                    {result.width} × {result.height} · {fmtSize(result.blob.size)}
                  </div>
                </div>
              </div>
              <div className={`grid gap-2 ${canShare ? "grid-cols-2" : "grid-cols-1"}`}>
                <Button variant="primary" onClick={() => downloadFile(result)}>
                  <Download className="size-4" /> Descarcă
                </Button>
                {canShare && (
                  <Button
                    onClick={async () => {
                      const ok = await shareFile(result);
                      if (!ok) downloadFile(result);
                    }}
                  >
                    <Share2 className="size-4" /> Partajează
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <Button variant="primary" className="w-full" onClick={run} disabled={working}>
              {working ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
              {working ? "Se procesează la rezoluție completă…" : "Exportă"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
