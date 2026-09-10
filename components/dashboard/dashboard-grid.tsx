"use client"

import type { ReactNode } from "react"
import { useState } from "react"
import { GridLayout, useContainerWidth, type Layout } from "react-grid-layout"
import "react-grid-layout/css/styles.css"
import "react-resizable/css/styles.css"
import { GripHorizontal, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"

const STORAGE_KEY = "dashboard-layout-v1"
const COLS = 12
const ROW_HEIGHT = 20
const MARGIN: readonly [number, number] = [16, 16]

// Each store's own arrangement, remembered per browser only — no server
// round-trip, no schema change. A layout saved under an older widget set
// (one added/removed since) is discarded rather than partially applied, so
// a future widget change can't leave a stale localStorage entry silently
// missing a card or crashing on an unknown id.
const DEFAULT_LAYOUT: Layout = [
  { i: "salesSummary", x: 0, y: 0, w: 4, h: 11, minW: 3, minH: 8 },
  { i: "statCards", x: 4, y: 0, w: 8, h: 11, minW: 4, minH: 6 },
  { i: "salesChart", x: 0, y: 11, w: 8, h: 16, minW: 4, minH: 8 },
  { i: "categoryChart", x: 8, y: 11, w: 4, h: 16, minW: 3, minH: 8 },
  { i: "transactions", x: 0, y: 27, w: 8, h: 14, minW: 4, minH: 8 },
  { i: "activityFeed", x: 8, y: 27, w: 4, h: 14, minW: 3, minH: 8 },
]

function loadLayout(): Layout {
  if (typeof window === "undefined") return DEFAULT_LAYOUT

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_LAYOUT

    const parsed = JSON.parse(raw) as Layout
    const ids = new Set(parsed.map((item) => item.i))
    const stillMatches =
      ids.size === DEFAULT_LAYOUT.length && DEFAULT_LAYOUT.every((item) => ids.has(item.i))

    return stillMatches ? parsed : DEFAULT_LAYOUT
  } catch {
    return DEFAULT_LAYOUT
  }
}

function saveLayout(layout: Layout) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
  } catch {
    // Private browsing / storage disabled — the layout just won't persist
    // across reloads, which is a fine degradation for a per-browser
    // convenience feature.
  }
}

/** Drag handle lives in its own strip so the rest of the card — chart period
 * toggles, tooltips, table rows — stays fully clickable; only this strip
 * triggers a drag (see dragConfig.handle below). */
function WidgetFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl">
      <div className="dashboard-widget-drag-handle group flex h-5 shrink-0 cursor-grab items-center justify-center active:cursor-grabbing">
        <GripHorizontal className="size-4 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground" />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  )
}

export type DashboardWidgetId =
  | "salesSummary"
  | "statCards"
  | "salesChart"
  | "categoryChart"
  | "transactions"
  | "activityFeed"

export function DashboardGrid({
  widgets,
}: {
  widgets: Record<DashboardWidgetId, ReactNode>
}) {
  const { width, containerRef, mounted } = useContainerWidth()
  const [layout, setLayout] = useState<Layout>(() => loadLayout())

  function handleLayoutChange(next: Layout) {
    setLayout(next)
    saveLayout(next)
  }

  function handleReset() {
    setLayout(DEFAULT_LAYOUT)
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Same private-browsing fallback as saveLayout — resetting in-memory
      // state still works even if clearing storage doesn't.
    }
  }

  return (
    <div ref={containerRef}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Drag the handle at the top of a card to rearrange it, or its bottom-right corner to resize.
        </p>
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={handleReset}>
          <RotateCcw className="size-3.5" />
          Reset layout
        </Button>
      </div>

      {mounted && (
        <GridLayout
          width={width}
          layout={layout}
          gridConfig={{ cols: COLS, rowHeight: ROW_HEIGHT, margin: MARGIN, containerPadding: [0, 0], maxRows: Infinity }}
          dragConfig={{ handle: ".dashboard-widget-drag-handle" }}
          resizeConfig={{ handles: ["se"] }}
          onLayoutChange={handleLayoutChange}
        >
          {DEFAULT_LAYOUT.map((item) => (
            <div key={item.i}>
              <WidgetFrame>{widgets[item.i as DashboardWidgetId]}</WidgetFrame>
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  )
}
