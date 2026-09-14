import { InvoiceStatus } from "@prisma/client";

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  PAID: "Paid",
  PARTIAL: "Partially Paid",
  CANCELLED: "Cancelled",
};

// Sourced from Branding's five status-bucket colors (see
// lib/branding.ts/StoreBranding) rather than hardcoded Tailwind classes —
// DRAFT/PAID/PARTIAL/CANCELLED each map onto whichever bucket they mean
// (Draft/Completed/Pending/Inactive), so a store recoloring "Pending"
// moves every kind of pending state across every module together.
const STATUS_STYLES: Record<InvoiceStatus, string> = {
  DRAFT: "bg-[var(--status-draft-bg)] text-[var(--status-draft-text)]",
  PAID: "bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]",
  PARTIAL: "bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]",
  CANCELLED: "bg-[var(--status-inactive-bg)] text-[var(--status-inactive-text)]",
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
