"use client"

import { useEffect, useRef } from "react"
import JsBarcode from "jsbarcode"

import type { StockTagData } from "@/lib/actions/inventory/stock-tag-actions"
import type { StockTagField } from "@/lib/stock-tag-fields"
import { stockTagLines, tagFontSize } from "@/components/inventory/stock/stock-tag-lines"

/**
 * The barcode layout of a stock tag — a jeweller's two-sided tag: store
 * name, barcode, tag code and karat on one half; the other fields Settings >
 * Tags picks (metals, weights, stones…) on the other. Shares the
 * `stock-qr-label` class so StockQrLabelPrintStyles prints it on the same
 * 80×30mm label as the QR layout.
 */
export function StockBarcodeLabel({ tag, fields }: { tag: StockTagData; fields: readonly StockTagField[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const lines = stockTagLines(tag, fields, { skip: ["STORE_NAME", "TAG_CODE"] })

  useEffect(() => {
    if (!svgRef.current) return
    try {
      JsBarcode(svgRef.current, tag.code, {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        height: 40,
        width: 1.4,
      })
    } catch {
      // A code CODE128 can't encode just leaves the barcode blank; the code
      // is still printed in text below it.
    }
  }, [tag.code])

  return (
    <div className="stock-qr-label flex w-[76mm] items-stretch gap-[3mm] rounded-lg border bg-white p-2 font-mono text-black">
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        {fields.includes("STORE_NAME") && (
          <p className="truncate text-[9px] font-bold uppercase leading-tight">{tag.storeName}</p>
        )}
        <svg ref={svgRef} className="h-[9mm] w-full" preserveAspectRatio="none" />
        <div className="flex items-end justify-between gap-1 text-[10px] font-bold leading-tight">
          {fields.includes("TAG_CODE") && <span className="truncate">{tag.code}</span>}
          {tag.karat && <span className="shrink-0">{tag.karat}</span>}
        </div>
      </div>

      {lines.length > 0 && (
        <>
          <div className="w-px shrink-0 border-l border-dashed border-black/40" />
          <div className="min-w-0 flex-1 font-bold leading-tight" style={{ fontSize: tagFontSize(lines.length) }}>
            {lines.map((line) => (
              <p key={line.key} className="truncate">
                {line.text}
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
