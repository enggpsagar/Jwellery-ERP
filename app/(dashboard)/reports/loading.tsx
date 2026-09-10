"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Mail } from "lucide-react"

import { emailAllReportsToMe } from "@/lib/actions/report-email-actions"
import { useToast } from "@/components/providers/toast-provider"
import { Button } from "@/components/ui/button"
import { Loader } from "@/components/ui/loader"

/** How long the plain spinner shows before offering the email fallback —
 *  long enough that a normal load never sees it, short enough that a
 *  merchant staring at a slow Reports page doesn't wait around wondering
 *  if anything is happening. */
const SLOW_LOAD_MS = 5000

/**
 * All 9 reports on /reports run in parallel on every load
 * (app/(dashboard)/reports/page.tsx) — Item Ledger and Gold Flow especially
 * can exceed a comfortable wait as data grows. There's no way to detect a
 * slow *server* render and gracefully fall back mid-request (once the
 * platform's function budget is hit, the request is just gone) — so this
 * offers the fallback proactively, from the client, the moment a load is
 * taking longer than a normal one should.
 */
export default function ReportsLoading() {
  const [slow, setSlow] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [sent, setSent] = useState(false)
  const searchParams = useSearchParams()
  const toast = useToast()

  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), SLOW_LOAD_MS)
    return () => window.clearTimeout(id)
  }, [])

  const handleEmailAll = async () => {
    setEmailing(true)
    try {
      const result = await emailAllReportsToMe({
        from: searchParams.get("from") ?? undefined,
        to: searchParams.get("to") ?? undefined,
      })
      if (result.success) {
        toast.success(result.message)
        setSent(true)
      } else {
        toast.error(result.message)
      }
    } finally {
      setEmailing(false)
    }
  }

  return (
    <main className="space-y-6 p-6">
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <Loader className="h-24 w-24" />
        <p className="text-sm text-muted-foreground">Loading reports...</p>

        {slow && (
          <div className="flex max-w-sm flex-col items-center gap-3 rounded-lg border bg-muted/30 p-4 text-center">
            <p className="text-sm text-muted-foreground">
              This is taking longer than usual — you can keep waiting, or have every report emailed to you instead.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleEmailAll}
              disabled={emailing || sent}
              className="gap-1.5"
            >
              {emailing ? <Loader className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
              {sent ? "Emailed" : "Email me all reports instead"}
            </Button>
          </div>
        )}
      </div>
    </main>
  )
}
