import { Aperture, Crop, Eraser, Palette, Sparkles, Spline, Sun, type LucideIcon } from "lucide-react";
import type { ToolId } from "@/lib/editor/types";

export const TOOLS: { id: ToolId; label: string; icon: LucideIcon }[] = [
  { id: "filters", label: "Filtre", icon: Sparkles },
  { id: "light", label: "Lumină", icon: Sun },
  { id: "color", label: "Culoare", icon: Palette },
  { id: "curves", label: "Curbe", icon: Spline },
  { id: "effects", label: "Efecte", icon: Aperture },
  { id: "crop", label: "Decupare", icon: Crop },
  { id: "heal", label: "Retuș", icon: Eraser },
];
