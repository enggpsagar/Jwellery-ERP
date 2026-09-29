/**
 * One stock tag, laid out for an 80mm thermal printer: the QR on the left,
 * everything else on the right, one tag per row. Used by both the single-
 * item print (StockQrCard) and the bulk Print QR Codes page, so a tag
 * printed either way comes out identical. Plain black on white — thermal
 * printers are monochrome. Printing goes through StockQrPrintRoot +
 * StockQrLabelPrintStyles.
 */
export type StockQrLabelData = {
  qrDataUrl: string
  stockCode: string
  tagNumber: string | null
  productName: string
  productCode: string | null
  metalName: string | null
  purity: string | null
  netWeight: string | null
  grossWeight: string | null
  manufactureDate: string | null
}

/** "GOLD_22K" → "22K"-style label for tags; a real per-metal purity label
 *  (StockItem.purityLabel) should be passed in preference when present. */
export function tagPurity(purityLabel: string | null | undefined, purity: string | null | undefined) {
  if (purityLabel) return purityLabel
  if (!purity) return null
  return purity.replace(/^(GOLD|SILVER|PLATINUM)_/, "").replace(/_/g, " ")
}

/** Label page size — one tag per printed page, which suits both a
 *  continuous 80mm thermal roll (it feeds 30mm per tag) and die-cut label
 *  rolls. `@page` needs two fixed lengths ("80mm auto" is invalid and makes
 *  the browser fall back to A4/Letter). */
export const STOCK_TAG_PAGE = { width: "80mm", height: "30mm" }

/** Print rules for a page that prints stock tags through StockQrPrintRoot:
 *  only that root prints, each tag on its own 80×30mm page. On screen the
 *  root stays hidden — the page shows its own preview instead. */
export function StockQrLabelPrintStyles() {
  return (
    <style>{`
      .stock-qr-print-root { display: none; }
      @page { size: ${STOCK_TAG_PAGE.width} ${STOCK_TAG_PAGE.height}; margin: 0; }
      @media print {
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
        body > *:not(.stock-qr-print-root) { display: none !important; }
        .stock-qr-print-root { display: block !important; }
        .stock-qr-print-root .stock-qr-label {
          box-sizing: border-box;
          width: ${STOCK_TAG_PAGE.width} !important;
          height: ${STOCK_TAG_PAGE.height} !important;
          margin: 0 !important;
          padding: 2mm 3mm !important;
          border: 0 !important;
          border-radius: 0 !important;
          overflow: hidden;
          break-after: page;
          page-break-after: always;
        }
        .stock-qr-print-root .stock-qr-label:last-child {
          break-after: auto;
          page-break-after: auto;
        }
      }
    `}</style>
  )
}

export function StockQrLabel({ label }: { label: StockQrLabelData }) {
  const weights = [
    label.netWeight ? `Net ${label.netWeight}` : null,
    label.grossWeight ? `Gross ${label.grossWeight}` : null,
  ].filter(Boolean)

  return (
    <div className="stock-qr-label flex w-[76mm] items-center gap-2 rounded-lg border bg-white p-2 text-black">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={label.qrDataUrl}
        alt={`QR code for stock ${label.stockCode}`}
        className="h-[24mm] w-[24mm] shrink-0"
        style={{ imageRendering: "pixelated" }}
      />
      <div className="min-w-0 flex-1 space-y-0.5 font-mono text-[10px] leading-tight">
        <p className="truncate text-[11px] font-bold">LR# {label.tagNumber ?? label.stockCode}</p>
        <p className="line-clamp-2 font-sans text-[10px]">{label.productName}</p>
        {/* Read off the tag by eye, so it's never mistaken for the LR# above. */}
        {label.productCode && <p className="truncate font-semibold tracking-wide">{label.productCode}</p>}
        {(label.metalName || label.purity) && (
          <p className="truncate">{[label.metalName, label.purity].filter(Boolean).join(" · ")}</p>
        )}
        {weights.length > 0 && <p className="truncate">{weights.join(" · ")}</p>}
        {label.manufactureDate && <p className="truncate">MFG {label.manufactureDate}</p>}
      </div>
    </div>
  )
}
