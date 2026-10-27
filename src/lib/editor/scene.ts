import { useEditor } from "./store";
import { buildScene, type Scene } from "./view";

type State = ReturnType<typeof useEditor.getState>;

export function viewportPad(cropMode: boolean, cssW: number): number {
  if (cropMode) return cssW < 640 ? 24 : 40;
  return cssW < 640 ? 8 : 28;
}

/** Scena curentă (layout + matrici) calculată din starea editorului. */
export function sceneFromState(s: State = useEditor.getState()): Scene | null {
  if (!s.image || !s.viewport.cssW || !s.viewport.cssH) return null;
  const cropMode = s.tool === "crop";
  return buildScene({
    cssW: s.viewport.cssW,
    cssH: s.viewport.cssH,
    srcW: s.image.width,
    srcH: s.image.height,
    geometry: s.edit.geometry,
    cropMode,
    view: s.view,
    pad: viewportPad(cropMode, s.viewport.cssW),
  });
}

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 40;

/** Zoom în jurul unui punct (coordonate CSS relative la viewport). */
export function zoomAt(cx: number, cy: number, factor: number) {
  const s = useEditor.getState();
  const { zoom, panX, panY } = s.view;
  const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
  const f = nz / zoom;
  const ox = cx - s.viewport.cssW / 2;
  const oy = cy - s.viewport.cssH / 2;
  s.setView({ zoom: nz, panX: ox - (ox - panX) * f, panY: oy - (oy - panY) * f });
}
