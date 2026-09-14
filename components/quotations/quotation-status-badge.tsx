const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  converted: "Converted",
  expired: "Expired",
};

// Sourced from Branding's five status-bucket colors (see
// lib/branding.ts/StoreBranding) — open maps to Pending (awaiting a
// decision), converted to Completed, expired to Inactive.
const STATUS_STYLES: Record<string, string> = {
  open: "bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]",
  converted: "bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]",
  expired: "bg-[var(--status-inactive-bg)] text-[var(--status-inactive-text)]",
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
