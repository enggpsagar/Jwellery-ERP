const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT_TO_KARIGAR: "Sent to Artisan",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
};

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-blue-100 text-blue-700",
  SENT_TO_KARIGAR: "bg-amber-100 text-amber-700",
  RECEIVED: "bg-green-100 text-green-700",
  CANCELLED: "bg-muted text-foreground",
};

export function DraftOrderStatusBadge({ status }: { status: string }) {
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
