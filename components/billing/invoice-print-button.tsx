"use client"

import { Printer } from "lucide-react"

/** print:hidden on the wrapper keeps the button itself off the printed page. */
export function InvoicePrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
    >
      <Printer className="h-4 w-4" />
      Print
    </button>
  )
}
