"use client";

import { cn } from "@/lib/utils";

type IncludesStoneToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  className?: string;
};

/**
 * The single "Includes a Stone" control used on every product/stock/
 * line-item form — a green check / red cross toggle rather than a plain
 * checkbox, so the on/off state reads at a glance. Keep every call site on
 * this component (not a raw <input type="checkbox">) so the look/behavior
 * stays identical everywhere it appears.
 */
export function IncludesStoneToggle({
  checked,
  onChange,
  label = "Includes a Stone",
  className,
}: IncludesStoneToggleProps) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer select-none items-center gap-2 text-xs font-medium",
        className
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-ring",
          checked ? "bg-emerald-500" : "bg-red-500"
        )}
      >
        <span
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold leading-none shadow transition-transform duration-200",
            checked ? "translate-x-[22px] text-emerald-600" : "translate-x-0.5 text-red-600"
          )}
        >
          {checked ? "✓" : "✕"}
        </span>
      </span>
      <span>{label}</span>
    </label>
  );
}
