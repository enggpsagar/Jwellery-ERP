import { PurityType } from "@prisma/client";

import { cn } from "@/lib/utils";

const PURITY_LABELS: Record<PurityType, string> = {
  GOLD_18K: "18K Gold",
  GOLD_20K: "20K Gold",
  GOLD_22K: "22K Gold",
  GOLD_24K: "24K Gold",
  SILVER_925: "925 Silver",
  SILVER_999: "999 Silver",
  OTHER: "Other",
};

const PURITY_STYLES: Record<PurityType, string> = {
  GOLD_18K: "bg-amber-50 text-amber-700 border-amber-200",
  GOLD_20K: "bg-amber-50 text-amber-700 border-amber-200",
  GOLD_22K: "bg-amber-100 text-amber-800 border-amber-300",
  GOLD_24K: "bg-amber-200 text-amber-900 border-amber-400",
  SILVER_925: "bg-slate-100 text-slate-700 border-slate-300",
  SILVER_999: "bg-slate-200 text-slate-800 border-slate-400",
  OTHER: "bg-gray-100 text-gray-700 border-gray-300",
};

type PurityBadgeProps = {
  purity: PurityType | null | undefined;
  className?: string;
};

export function PurityBadge({ purity, className }: PurityBadgeProps) {
  if (!purity) {
    return (
      <span className="inline-flex items-center rounded-full border border-dashed border-gray-300 px-2.5 py-0.5 text-xs text-muted-foreground">
        Not set
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        PURITY_STYLES[purity],
        className,
      )}
    >
      {PURITY_LABELS[purity]}
    </span>
  );
}
