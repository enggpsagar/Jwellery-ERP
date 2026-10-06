import type { StockTagData } from "@/lib/actions/inventory/stock-tag-actions"
import type { StockTagField } from "@/lib/stock-tag-fields"
import { stockTagLines, tagFontSize } from "@/components/inventory/stock/stock-tag-lines"

/**
 * One stock tag, laid out for an 80mm thermal printer: the QR on the left,
 * the fields Settings > Tags picks on the right, one tag per row. Used by both the single-
 * item print (StockQrCard) and the bulk Print QR Codes page, so a tag
 * printed either way comes out identical. Plain black on white — thermal
 * printers are monochrome. Printing goes through StockQrPrintRoot +
 * StockQrLabelPrintStyles.
 */
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

export function StockQrLabel({
  tag,
  qrDataUrl,
  fields,
}: {
  tag: StockTagData
  qrDataUrl: string
  fields: readonly StockTagField[]
}) {
  // Store name and tag code print under the QR (same as the barcode
  // layout prints them beside its barcode), not in the text column.
  const lines = stockTagLines(tag, fields, { skip: ["STORE_NAME", "TAG_CODE"] })
  const showStoreName = fields.includes("STORE_NAME")
  const showCode = fields.includes("TAG_CODE")

  return (
    <div className="stock-qr-label flex w-[76mm] items-center gap-2 rounded-lg border bg-white p-2 text-black">
      <div data-testid="stock-tag-qr" className="flex w-[24mm] shrink-0 flex-col items-center font-mono font-bold leading-tight">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrDataUrl}
          alt={`QR code for stock ${tag.stockCode}`}
          className={showStoreName || showCode ? "h-[19mm] w-[19mm]" : "h-[24mm] w-[24mm]"}
          style={{ imageRendering: "pixelated" }}
        />
        {showStoreName && (
          <p className="w-full truncate text-center text-[7px] uppercase">{tag.storeName}</p>
        )}
        {showCode && <p className="w-full truncate text-center text-[8px]">{tag.code}</p>}
      </div>
      <div data-testid="stock-tag-details" className="min-w-0 flex-1 font-mono leading-tight" style={{ fontSize: tagFontSize(lines.length) }}>
        {lines.map((line) => (
          <p key={line.key} className={`truncate ${line.bold ? "font-bold" : ""}`}>
            {line.text}
          </p>
        ))}
      </div>
    </div>
  )
}
