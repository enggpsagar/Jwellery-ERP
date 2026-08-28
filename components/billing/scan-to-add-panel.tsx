"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, Loader2, ScanLine, Square, Wifi } from "lucide-react"

import {
  pollScanSession,
  startScanSession,
  stopScanSession,
} from "@/lib/actions/scan-session-actions"
import { Button } from "@/components/ui/button"
import { WebcamQrScanner } from "@/components/shared/webcam-qr-scanner"

/**
 * "Add item by scanning" for a billing screen, by either route.
 *
 * A camera on this device is the direct one: it decodes in the page and
 * hands the id straight to the form. A phone is the other, for counters with
 * no webcam or where the tags are easier to reach than the screen — it
 * cannot hold the invoice, so it scans into a session and this listens.
 *
 * The phone route polls rather than holding a socket. Scans are seconds
 * apart and arrive in ones, so a two-second poll is indistinguishable from a
 * push at the counter — and it keeps working on serverless hosting, where a
 * long-lived connection is the thing that does not.
 */

const POLL_MS = 2000

export function ScanToAddPanel({
  onScanned,
}: {
  /** Called once per scan, in the order the tags were scanned. */
  onScanned: (stockId: string) => void
}) {
  const [sessionId, setSessionId] = useState<string | null>(null)

  // The two routes are independent: the camera on this device needs no
  // session, because there is no second device to coordinate with.
  const [webcamOpen, setWebcamOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [count, setCount] = useState(0)
  const [lastAt, setLastAt] = useState<string | null>(null)

  // Held in a ref as well as state: the poll loop closes over these, and
  // reading them from state would poll with whatever values existed when the
  // interval was created.
  const sinceRef = useRef<string | undefined>(undefined)
  const onScannedRef = useRef(onScanned)
  onScannedRef.current = onScanned

  const start = useCallback(async () => {
    setStarting(true)
    setError(null)
    try {
      const session = await startScanSession()
      sinceRef.current = undefined
      setCount(0)
      setSessionId(session.sessionId)
    } catch {
      setError("Could not start scanning. Check you can create invoices here.")
    } finally {
      setStarting(false)
    }
  }, [])

  const stop = useCallback(async () => {
    const id = sessionId
    setSessionId(null)
    setLastAt(null)
    if (id) {
      try {
        await stopScanSession(id)
      } catch {
        // A session left open expires on its own; failing to close it is not
        // worth an error in front of someone mid-sale.
      }
    }
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return

    let cancelled = false

    const tick = async () => {
      try {
        const result = await pollScanSession(sessionId, sinceRef.current)
        if (cancelled) return

        if (!result.active) {
          setSessionId(null)
          return
        }

        for (const item of result.items) {
          onScannedRef.current(item.stockId)
          // Advanced per item so a failure part-way through does not replay
          // the ones already added.
          sinceRef.current = new Date(item.scannedAt).toISOString()
        }

        if (result.items.length > 0) {
          setCount((previous) => previous + result.items.length)
          setLastAt(new Date().toLocaleTimeString("en-IN"))
        }
      } catch {
        // A dropped poll is not worth reporting — the next one recovers, and
        // `since` means nothing is lost in between.
      }
    }

    const interval = setInterval(tick, POLL_MS)
    tick()

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [sessionId])

  // Close the session when the page goes away, so an abandoned tab does not
  // keep claiming scans until it expires.
  useEffect(() => {
    if (!sessionId) return

    const close = () => {
      navigator.sendBeacon?.("/api/scan-session/close", sessionId)
    }

    window.addEventListener("pagehide", close)
    return () => window.removeEventListener("pagehide", close)
  }, [sessionId])

  if (!sessionId) {
    return (
      <div className="rounded-lg border border-dashed p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Add items by scanning</p>
            <p className="text-xs text-muted-foreground">
              Use a camera on this computer, or scan with your phone — either
              way the tags become line items here.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setWebcamOpen(true)}
            >
              <Camera className="mr-1.5 size-4" />
              Use this camera
            </Button>

            <Button type="button" variant="outline" onClick={start} disabled={starting}>
              {starting ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <ScanLine className="mr-1.5 size-4" />
              )}
              {starting ? "Starting..." : "Scan with phone"}
            </Button>
          </div>
        </div>

        {error ? (
          <p className="mt-2 text-xs text-destructive">{error}</p>
        ) : null}

        {webcamOpen ? (
          <div className="mt-3">
            <WebcamQrScanner
              onScanned={onScanned}
              onClose={() => setWebcamOpen(false)}
            />
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-[color-mix(in_oklab,var(--chart-3)_45%,transparent)] bg-[color-mix(in_oklab,var(--chart-3)_7%,transparent)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="relative mt-1 flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--chart-3)] opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-[var(--chart-3)]" />
          </span>

          <div>
            <p className="text-sm font-medium">Listening for scans</p>
            <p className="text-xs text-muted-foreground">
              Open the camera on your phone and scan a tag. Keep scanning —
              each one is added as a new line.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {count} scanned
              {lastAt ? ` · last at ${lastAt}` : ""}
            </p>
          </div>
        </div>

        <Button type="button" variant="outline" onClick={stop}>
          <Square className="mr-1.5 size-3.5" />
          Stop
        </Button>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Wifi className="size-3.5" />
        Your phone must be signed in to the same account.
      </p>
    </div>
  )
}
