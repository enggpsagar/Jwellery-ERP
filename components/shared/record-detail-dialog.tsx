"use client"

import * as React from "react"
import Link from "next/link"
import { ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/**
 * The Parties pop-up (PartyDetailDialog), generalised for every list.
 *
 * Clicking a list's first column opens the record in a wide pop-up. The
 * pop-up renders the module's own detail panel — the same one shown beside
 * the list — so the two can't drift. The panel's card shell (border,
 * padding, background) is stripped here, since the dialog is already the
 * card. Actions inside the panel that navigate away unmount the dialog with
 * the page; ones that delete/archive the record close it via
 * useRecordDialog once the row leaves the list.
 */
export function RecordDetailDialog({
  open,
  onOpenChange,
  title,
  fullPageHref,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Names the dialog for screen readers; the panel renders the visible heading. */
  title: string
  /** The record's standalone page, linked beside the close X. */
  fullPageHref?: string
  /** The detail panel; only mounted while open. */
  children: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto p-6 pt-12 sm:max-w-5xl [&>*]:min-w-0">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{title} — full details.</DialogDescription>

        {fullPageHref ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute top-2 right-10"
            aria-label="Open full page"
            asChild
          >
            <Link href={fullPageHref}>
              <ExternalLink />
            </Link>
          </Button>
        ) : null}

        {/* pt-12 keeps the panel's own header actions clear of the X. */}
        <div className="min-w-0 [&>div:first-child]:rounded-none [&>div:first-child]:border-0 [&>div:first-child]:bg-transparent [&>div:first-child]:p-0 [&>div:first-child]:shadow-none">
          {open ? children : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Which record a list's pop-up is showing (null = closed). Closes itself
 * when that record leaves `rows` — archived, deleted or filtered out from
 * inside the pop-up.
 */
export function useRecordDialog<T extends { id: string }>(rows: T[] | undefined) {
  const [openId, setOpenId] = React.useState<string | null>(null)

  React.useEffect(() => {
    setOpenId((current) =>
      current && (rows ?? []).some((row) => row.id === current) ? current : null,
    )
  }, [rows])

  return {
    openId,
    open: setOpenId,
    dialogProps: {
      open: openId !== null,
      onOpenChange: (open: boolean) => {
        if (!open) setOpenId(null)
      },
    },
  }
}

/**
 * A list's first-column label, made the pop-up's trigger. The click still
 * bubbles to the row, so a master-detail list also selects the row for its
 * side panel.
 */
export const OpenRecordButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & { onOpen: () => void }
>(function OpenRecordButton({ onOpen, onClick, className, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      data-record-open=""
      onClick={(e) => {
        onClick?.(e)
        onOpen()
      }}
      className={cn(
        "text-left font-medium underline-offset-4 hover:text-primary hover:underline focus-visible:underline focus-visible:outline-none",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
})
