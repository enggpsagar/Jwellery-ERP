import { InvoiceStatus } from "@prisma/client";

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  PAID: "Paid",
  PARTIAL: "Partially Paid",
  CANCELLED: "Cancelled",
};

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  DRAFT: "bg-muted text-foreground",
  PAID: "bg-green-100 text-green-700",
  PARTIAL: "bg-yellow-100 text-yellow-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
