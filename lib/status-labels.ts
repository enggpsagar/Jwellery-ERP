/**
 * Status labels for exports — the same wording the list badges show
 * (invoice/purchase/draft-order/quotation/stock status badges), so a file
 * reads "Partially Paid", not the raw enum "PARTIAL". Client-safe.
 */
const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PAID: "Paid",
  PARTIAL: "Partially Paid",
  CANCELLED: "Cancelled",
}

const DRAFT_ORDER_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT_TO_KARIGAR: "Sent to Artisan",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
}

const QUOTATION_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  converted: "Converted",
  expired: "Expired",
}

const STOCK_STATUS_LABELS: Record<string, string> = {
  IN_STOCK: "In Stock",
  SOLD: "Sold",
  RESERVED: "Reserved",
  ISSUED_TO_KARIGAR: "With Artisan",
  DAMAGED: "Damaged",
  ARCHIVED: "Archived",
}

/** Anything unmapped: "SOME_VALUE" → "Some Value". */
function humanize(value: string) {
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ")
}

const lookup = (labels: Record<string, string>) => (status: string | null | undefined) =>
  status ? labels[status] ?? humanize(status) : ""

/** Invoice and Purchase (both use InvoiceStatus). */
export const invoiceStatusLabel = lookup(INVOICE_STATUS_LABELS)
export const draftOrderStatusLabel = lookup(DRAFT_ORDER_STATUS_LABELS)
export const quotationStatusLabel = lookup(QUOTATION_STATUS_LABELS)
export const stockStatusLabel = lookup(STOCK_STATUS_LABELS)
