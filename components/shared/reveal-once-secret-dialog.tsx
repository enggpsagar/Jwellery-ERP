"use client"

import { useState } from "react"
import { Check, Copy, ShieldAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * Shows a freshly-generated secret exactly once. There is nothing to
 * re-fetch afterward — the raw value is never persisted anywhere, only its
 * hash — so this dialog is the only place it will ever be visible again.
 */
export function RevealOnceSecretDialog({
  open,
  onOpenChange,
  title,
  secret,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  secret: string
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error("Failed to copy to clipboard:", error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Copy this now — it will not be shown again.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3">
          <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm">
            {secret}
          </code>
          <Button type="button" size="sm" variant="outline" onClick={handleCopy}>
            {copied ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-amber-900 dark:text-amber-200">
            You won&apos;t be able to see this value again after closing this
            dialog. If you lose it, revoke the key and create a new one.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
