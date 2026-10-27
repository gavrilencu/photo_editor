import { create } from "zustand";
import { DEFAULT_EDIT } from "./defaults";
import type { AdjustKey, EditState, Stroke, ToolId } from "./types";
import type { ViewState } from "./view";

const HISTORY_LIMIT = 80;

export interface ImageInfo {
  name: string;
  width: number;
  height: number;
  /** Crește la fiecare schimbare a pixelilor sursă (încărcare, retuș). */
  version: number;
}

interface EditorStore {
  edit: EditState;
  committed: EditState;
  past: EditState[];
  future: EditState[];

  image: ImageInfo | null;
  tool: ToolId;
  compare: boolean;
  holdOriginal: boolean;
  splitPos: number;
  showHistogram: boolean;
  view: ViewState;
  viewport: { cssW: number; cssH: number };
  busy: string | null;
  toast: string | null;
  exportOpen: boolean;

  strokes: Stroke[];
  liveStroke: Stroke | null;
  brushSize: number;
  autoHeal: boolean;

  luts: { id: string; name: string }[];

  /** Modificare „live” (fără intrare în istoric), ex. în timpul tragerii unui slider. */
  setEdit: (fn: (e: EditState) => EditState) => void;
  /** Salvează starea curentă în istoric. */
  commit: () => void;
  /** Modificare + salvare în istoric. */
  apply: (fn: (e: EditState) => EditState) => void;
  setAdj: (key: AdjustKey, value: number) => void;
  undo: () => void;
  redo: () => void;
  resetEdits: () => void;

  loadImage: (info: Omit<ImageInfo, "version">) => void;
  bumpImageVersion: () => void;
  setTool: (tool: ToolId) => void;
  setView: (view: Partial<ViewState>) => void;
  resetView: () => void;
  setViewport: (cssW: number, cssH: number) => void;
  set: (partial: Partial<EditorStore>) => void;
  showToast: (msg: string) => void;
}

const INITIAL_VIEW: ViewState = { zoom: 1, panX: 0, panY: 0 };

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useEditor = create<EditorStore>((set, get) => ({
  edit: DEFAULT_EDIT,
  committed: DEFAULT_EDIT,
  past: [],
  future: [],

  image: null,
  tool: "filters",
  compare: false,
  holdOriginal: false,
  splitPos: 0.5,
  showHistogram: false,
  view: INITIAL_VIEW,
  viewport: { cssW: 0, cssH: 0 },
  busy: null,
  toast: null,
  exportOpen: false,

  strokes: [],
  liveStroke: null,
  brushSize: 48,
  autoHeal: true,

  luts: [],

  setEdit: (fn) => set((s) => ({ edit: fn(s.edit) })),

  commit: () =>
    set((s) => {
      if (s.edit === s.committed) return {};
      const past = [...s.past, s.committed];
      if (past.length > HISTORY_LIMIT) past.shift();
      return { past, committed: s.edit, future: [] };
    }),

  apply: (fn) => {
    get().setEdit(fn);
    get().commit();
  },

  setAdj: (key, value) => set((s) => ({ edit: { ...s.edit, adj: { ...s.edit.adj, [key]: value } } })),

  undo: () =>
    set((s) => {
      // modificările necomise se anulează primele
      if (s.edit !== s.committed) return { edit: s.committed };
      const prev = s.past[s.past.length - 1];
      if (!prev) return {};
      return {
        past: s.past.slice(0, -1),
        future: [s.committed, ...s.future],
        committed: prev,
        edit: prev,
      };
    }),

  redo: () =>
    set((s) => {
      const next = s.future[0];
      if (!next) return {};
      return {
        past: [...s.past, s.committed],
        future: s.future.slice(1),
        committed: next,
        edit: next,
      };
    }),

  resetEdits: () => {
    const { edit } = get();
    get().apply(() => ({ ...DEFAULT_EDIT, healCount: edit.healCount }));
  },

  loadImage: (info) =>
    set((s) => ({
      image: { ...info, version: (s.image?.version ?? 0) + 1 },
      edit: DEFAULT_EDIT,
      committed: DEFAULT_EDIT,
      past: [],
      future: [],
      view: INITIAL_VIEW,
      strokes: [],
      liveStroke: null,
      compare: false,
      holdOriginal: false,
      tool: s.tool === "crop" || s.tool === "heal" ? "filters" : s.tool,
    })),

  bumpImageVersion: () => set((s) => (s.image ? { image: { ...s.image, version: s.image.version + 1 } } : {})),

  setTool: (tool) =>
    set((s) => {
      const leavingCrop = (s.tool === "crop") !== (tool === "crop");
      return {
        tool,
        view: leavingCrop ? INITIAL_VIEW : s.view,
        compare: tool === "crop" ? false : s.compare,
      };
    }),

  setView: (v) => set((s) => ({ view: { ...s.view, ...v } })),
  resetView: () => set({ view: INITIAL_VIEW }),
  setViewport: (cssW, cssH) => set({ viewport: { cssW, cssH } }),
  set: (partial) => set(partial),

  showToast: (msg) => {
    clearTimeout(toastTimer);
    set({ toast: msg });
    toastTimer = setTimeout(() => set({ toast: null }), 3200);
  },
}));
