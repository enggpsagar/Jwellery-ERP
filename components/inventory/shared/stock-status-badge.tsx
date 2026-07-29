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
  ARCHIVED: "bg-gray-100 text-gray-600",
};

type StockStatusBadgeProps = {
  status: InventoryStockStatus;
  className?: string;
};

export function StockStatusBadge({ status, className }: StockStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
        STATUS_STYLES[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
