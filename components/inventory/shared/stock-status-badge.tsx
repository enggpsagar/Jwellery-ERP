import { InventoryStockStatus } from "@prisma/client";

import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<InventoryStockStatus, string> = {
  IN_STOCK: "In Stock",
  SOLD: "Sold",
  RESERVED: "Reserved",
  ISSUED_TO_KARIGAR: "With Karigar",
  DAMAGED: "Damaged",
  ARCHIVED: "Archived",
};

const STATUS_STYLES: Record<InventoryStockStatus, string> = {
  IN_STOCK: "bg-green-100 text-green-700",
  SOLD: "bg-blue-100 text-blue-700",
  RESERVED: "bg-yellow-100 text-yellow-700",
  ISSUED_TO_KARIGAR: "bg-purple-100 text-purple-700",
  DAMAGED: "bg-red-100 text-red-700",
  ARCHIVED: "bg-muted text-muted-foreground",
};

type StockStatusBadgeProps = {
  status: InventoryStockStatus;
  /**
   * Pieces remaining. Optional so existing callers keep working, but pass it
   * wherever it is known: a row can sit at IN_STOCK holding nothing — a
   * stock entry opened from Add Product defaults to a quantity of 0 — and
   * "In Stock" against zero pieces is the wrong answer.
   */
  quantity?: number;
  className?: string;
};

export function StockStatusBadge({
  status,
  quantity,
  className,
}: StockStatusBadgeProps) {
  // Only IN_STOCK/RESERVED claim availability, so only those can contradict
  // a zero quantity. SOLD, DAMAGED and the rest already say why the piece
  // isn't there and should keep saying it.
  const claimsAvailable =
    status === "IN_STOCK" || status === "RESERVED";
  const isEmpty = claimsAvailable && quantity !== undefined && quantity <= 0;

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
        isEmpty ? "bg-orange-100 text-orange-700" : STATUS_STYLES[status],
        className,
      )}
    >
      {isEmpty ? "Out of Stock" : STATUS_LABELS[status]}
    </span>
  );
}
