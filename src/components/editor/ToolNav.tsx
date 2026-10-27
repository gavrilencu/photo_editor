"use client";

import { useEditor } from "@/lib/editor/store";
import { TOOLS } from "./tools";

/** Bara verticală de unelte (desktop). */
export function ToolRail() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  return (
    <nav className="hidden w-[76px] shrink-0 flex-col items-center gap-1 border-r border-line bg-panel py-3 md:flex" aria-label="Unelte">
      {TOOLS.map(({ id, label, icon: Icon }) => {
        const active = tool === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setTool(id)}
            aria-current={active}
            className={`flex w-[64px] flex-col items-center gap-1 rounded-lg py-2 text-[11px] transition-colors ${
              active ? "bg-accent/15 text-accent" : "text-muted hover:bg-panel-3 hover:text-fg"
            }`}
          >
            <Icon className="size-5" strokeWidth={1.75} />
            {label}
          </button>
        );
      })}
    </nav>
  );
}

/** Bara de unelte de jos (mobil). */
export function ToolTabs() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  return (
    <nav
      className="no-scrollbar flex shrink-0 overflow-x-auto border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Unelte"
    >
      {TOOLS.map(({ id, label, icon: Icon }) => {
        const active = tool === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setTool(id)}
            aria-current={active}
            className={`flex min-w-[52px] flex-1 flex-col items-center gap-0.5 px-0.5 pb-2 pt-2.5 text-[10.5px] transition-colors ${
              active ? "text-accent" : "text-muted"
            }`}
          >
            <Icon className="size-[22px]" strokeWidth={1.75} />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
