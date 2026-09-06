"use client"

import { useState } from "react"
import { RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type ResetFormWrapperProps = {
  children: React.ReactNode
  /** True for a form with real in-progress work worth losing to a
   * misclick — line items, a picked customer/vendor, payment splits —
   * where resetting straight away isn't worth the risk. A short record
   * form (name/phone/address) resets immediately instead. */
  requireConfirm?: boolean
}

/**
 * Wraps any entry-page form with a "Reset" icon that clears it back to
 * its initial, empty state — every field, every piece of picked/derived
 * state (a selected customer, added line items, a unit toggle), not just
 * the plain text inputs a native `<button type="reset">` would reach.
 *
 * Deliberately doesn't try to walk the wrapped form's own state to clear
 * it piece by piece — that would mean re-deriving every form's internal
 * shape here and re-doing it by hand for each one. Instead it forces a
 * full remount of whatever's inside by changing the `key` on the element
 * wrapping it: React treats a changed key as a brand new element and
 * throws away the entire subtree's state, uncontrolled and controlled
 * alike, then rebuilds it fresh from the same initial props — the same
 * effect as reopening the page, without an actual navigation.
 */
export function ResetFormWrapper({ children, requireConfirm = false }: ResetFormWrapperProps) {
  const [resetKey, setResetKey] = useState(0)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const doReset = () => setResetKey((key) => key + 1)

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="icon"
          title="Reset form"
          aria-label="Reset form"
          onClick={() => (requireConfirm ? setConfirmOpen(true) : doReset())}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      <div key={resetKey}>{children}</div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset this form?</DialogTitle>
            <DialogDescription>
              Everything entered so far — line items, the selected customer/vendor,
              payment details — will be cleared. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                doReset()
                setConfirmOpen(false)
              }}
            >
              Reset Form
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
