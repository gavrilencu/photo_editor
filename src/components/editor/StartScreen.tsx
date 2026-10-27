"use client";

import { Crop, Eraser, ImagePlus, Palette, Sparkles, Spline } from "lucide-react";
import { promptOpenImage } from "@/lib/editor/actions";

const FEATURES = [
  { icon: Sparkles, text: "Filtre și LUT-uri .cube" },
  { icon: Palette, text: "HSL și color grading" },
  { icon: Spline, text: "Curbe de ton RGB" },
  { icon: Crop, text: "Decupare și îndreptare" },
  { icon: Eraser, text: "Ștergere obiecte" },
];

export function StartScreen({ dragging }: { dragging: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-4">
      <div
        className={`flex w-full max-w-xl flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors md:py-14 ${
          dragging ? "border-accent bg-accent/10" : "border-line bg-panel/60"
        }`}
      >
        <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-[#a66dff] shadow-lg shadow-accent/20">
          <ImagePlus className="size-8 text-white" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Editează-ți fotografiile</h1>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
          Totul rulează local, în browser, accelerat pe GPU. Fotografiile tale nu sunt încărcate pe niciun server.
        </p>
        <button
          type="button"
          onClick={promptOpenImage}
          className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-6 text-base font-medium text-white shadow-lg shadow-accent/25 hover:bg-accent-strong"
        >
          <ImagePlus className="size-5" />
          Deschide o imagine
        </button>
        <p className="mt-3 hidden text-xs text-faint md:block">sau trage o imagine aici · sau lipește cu Ctrl+V</p>
        <ul className="mt-8 flex flex-wrap justify-center gap-2">
          {FEATURES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-1.5 rounded-full bg-panel-3 px-3 py-1.5 text-xs text-muted">
              <Icon className="size-3.5" />
              {text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
