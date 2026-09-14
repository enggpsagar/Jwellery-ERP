const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT_TO_KARIGAR: "Sent to Artisan",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
};

// Sourced from Branding's five status-bucket colors (see
// lib/branding.ts/StoreBranding) — SENT_TO_KARIGAR maps to Pending (awaiting
// the artisan) and RECEIVED to Completed.
const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-[var(--status-draft-bg)] text-[var(--status-draft-text)]",
  SENT_TO_KARIGAR: "bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]",
  RECEIVED: "bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]",
  CANCELLED: "bg-[var(--status-inactive-bg)] text-[var(--status-inactive-text)]",
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
