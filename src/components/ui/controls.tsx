"use client";

import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";

export function Section({
  title,
  onReset,
  children,
  right,
}: {
  title: string;
  onReset?: () => void;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="border-b border-line px-4 py-3 last:border-b-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{title}</h3>
        <div className="flex items-center gap-1">
          {right}
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="rounded p-1 text-faint hover:bg-panel-3 hover:text-fg"
              title="Resetează secțiunea"
              aria-label={`Resetează ${title}`}
            >
              <RotateCcw className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = "",
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex rounded-lg bg-panel-2 p-0.5 ${className}`} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors ${
            o.value === value ? "bg-panel-3 text-fg shadow-sm" : "text-muted hover:text-fg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function IconButton({
  label,
  onClick,
  children,
  active,
  disabled,
  className = "",
  onPointerDown,
  onPointerUp,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onPointerCancel={onPointerUp}
      className={`flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-30 ${
        active ? "bg-accent/20 text-accent" : "text-muted hover:bg-panel-3 hover:text-fg"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function Button({
  children,
  onClick,
  variant = "secondary",
  disabled,
  className = "",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const styles = {
    primary: "bg-accent text-white hover:bg-accent-strong",
    secondary: "bg-panel-3 text-fg hover:bg-[#2e2e36]",
    ghost: "text-muted hover:bg-panel-3 hover:text-fg",
  }[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1 text-[13px] text-muted">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-accent" : "bg-panel-3"}`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-white transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`}
        />
      </button>
    </label>
  );
}
