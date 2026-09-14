import { InvoiceStatus } from "@prisma/client";

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  PAID: "Paid",
  PARTIAL: "Partially Paid",
  CANCELLED: "Cancelled",
};

// Sourced from Branding's five status-bucket colors (see
// lib/branding.ts/StoreBranding) — same DRAFT/PAID/PARTIAL/CANCELLED
// mapping invoice-status-badge.tsx uses (both share the InvoiceStatus
// enum), so a store's Draft/Pending/Completed/Inactive choices apply
// consistently across Billing and Purchases together.
const STATUS_STYLES: Record<InvoiceStatus, string> = {
  DRAFT: "bg-[var(--status-draft-bg)] text-[var(--status-draft-text)]",
  PAID: "bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]",
  PARTIAL: "bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]",
  CANCELLED: "bg-[var(--status-inactive-bg)] text-[var(--status-inactive-text)]",
};

export function PurchaseStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
