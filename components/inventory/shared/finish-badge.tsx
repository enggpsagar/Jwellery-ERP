import { InventoryFinish } from "@prisma/client";

import { cn } from "@/lib/utils";

const FINISH_LABELS: Record<InventoryFinish, string> = {
  KACHA: "Kacha",
  PAKKA: "Pakka / Hallmarked",
};

const FINISH_STYLES: Record<InventoryFinish, string> = {
  KACHA: "bg-amber-100 text-amber-700",
  PAKKA: "bg-emerald-100 text-emerald-700",
};

type FinishBadgeProps = {
  finish: InventoryFinish;
  className?: string;
};

export function FinishBadge({ finish, className }: FinishBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
        FINISH_STYLES[finish],
        className,
      )}
    >
      {FINISH_LABELS[finish]}
    </span>
  );
}
