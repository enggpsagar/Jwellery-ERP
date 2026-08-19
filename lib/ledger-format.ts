import { LedgerSourceType } from "@prisma/client"

export function formatLedgerSource(
  sourceType: LedgerSourceType | string | null | undefined
) {
  if (!sourceType) return "Manual"

  switch (sourceType) {
    case LedgerSourceType.MANUAL:
      return "Manual"
    case LedgerSourceType.SALE:
      return "Sale"
    case LedgerSourceType.PURCHASE:
      return "Purchase"
    case LedgerSourceType.KARIGAR_ISSUE:
      return "Karigar Issue"
    case LedgerSourceType.KARIGAR_RECEIPT:
      return "Karigar Receipt"
    case LedgerSourceType.ADJUSTMENT:
      return "Adjustment"
    default:
      return String(sourceType)
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase())
  }
}
