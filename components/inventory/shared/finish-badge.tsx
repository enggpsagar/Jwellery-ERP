import { InventoryFinish } from "@prisma/client";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const FINISH_LABELS: Record<InventoryFinish, string> = {
  KACHA: "Kacha",
  PAKKA: "Pakka / Hallmarked",
};

// Same text on every screen except PAKKA, whose full label is what breaks
// the stock table's layout on narrow screens — shortened there, with the
// full label always still available via the tooltip.
const FINISH_SHORT_LABELS: Record<InventoryFinish, string> = {
  KACHA: "Kacha",
  PAKKA: "Pakka",
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
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
            FINISH_STYLES[finish],
            className,
          )}
        >
          <span className="sm:hidden">{FINISH_SHORT_LABELS[finish]}</span>
          <span className="hidden sm:inline">{FINISH_LABELS[finish]}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{FINISH_LABELS[finish]}</TooltipContent>
    </Tooltip>
  );
}
