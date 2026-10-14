"use client"

import Link from "next/link"
import { ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { CustomerDetailPanel } from "@/components/customers/customer-detail-panel"

type StateItem = {
  id: string
  name: string
}

/**
 * A party's whole picture in one pop-up, opened from the Parties list:
 * details, the one net balance (Receivable / Payable), the ledger summary
 * and the full ledger history (open, not behind "View Details"). Renders
 * the same CustomerDetailPanel as the side panel, so the two can't drift;
 * wider so the ledger table has room. Sale / Purchase / Payment links
 * inside navigate away, which unmounts the dialog with the page.
 */
export function PartyDetailDialog({
  customerId,
  states,
  onOpenChange,
}: {
  /** The party shown; null = closed. */
  customerId: string | null
  states: StateItem[]
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={customerId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto p-6 pt-10 sm:max-w-5xl [&>*]:min-w-0">
        {/* The panel renders the visible name heading; these name the
            dialog for screen readers. pt-10 plus the panel's bare-mode pr-10
            keep the close X clear of the header's Edit/Archive/Delete icons. */}
        <DialogTitle className="sr-only">Party details</DialogTitle>
        <DialogDescription className="sr-only">
          Party details, net balance and full ledger.
        </DialogDescription>
        {customerId ? (
          <CustomerDetailPanel
            key={customerId}
            customerId={customerId}
            states={states}
            bare
            defaultShowLedgerDetails
            headerActions={
              <Button variant="outline" size="icon" aria-label="Open full page" asChild>
                <Link href={`/customers/${customerId}`}>
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
            }
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
