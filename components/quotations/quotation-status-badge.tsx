const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  converted: "Converted",
  expired: "Expired",
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  converted: "bg-green-100 text-green-700",
  expired: "bg-muted text-foreground",
};

export function QuotationStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
        STATUS_STYLES[status] ?? "bg-muted text-foreground"
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
