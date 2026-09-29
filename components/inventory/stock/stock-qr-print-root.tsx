"use client"

import { useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

/**
 * Renders `children` as a direct child of <body>, shown only when printing.
 * The dashboard layout (sidebar, top bar) has no print styles of its own and
 * still occupies space when merely hidden, which pushed printed tags off an
 * 80mm roll; printing from outside it — with every other <body> child
 * `display: none` — puts each tag exactly at the paper's edge.
 */
export function StockQrPrintRoot({ id, children }: { id: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return createPortal(
    <div id={id} className="stock-qr-print-root">
      {children}
    </div>,
    document.body,
  )
}
