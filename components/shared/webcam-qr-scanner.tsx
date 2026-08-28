"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CameraOff, Loader2, X } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Reads stock QR labels from a camera attached to this device.
 *
 * The sibling of the phone flow, not a replacement for it: a counter with a
 * webcam pointed at the desk can bill without a second device, while a shop
 * without one keeps using a phone. Both end in the same place — a stock id
 * handed to the billing form.
 *
 * Decoding prefers the browser's own BarcodeDetector, which is hardware
 * accelerated and costs nothing to ship. Safari and Firefox do not have it,
 * so jsQR decodes a canvas frame instead; that is why the library is a
 * dependency at all rather than the first choice.
 */

/** Not in TypeScript's DOM types yet, and absent in several browsers. */
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats?: string[] }): BarcodeDetectorLike
      getSupportedFormats?: () => Promise<string[]>
    }
  }
}

/**
 * Pull the stock id out of whatever the label encodes.
 *
 * Current labels hold `/s/<id>`; ones printed before the scan entry point
 * existed hold `/inventory/stock/<id>`, and the sale screen's own URL is
 * `/q/<id>`. All three are accepted so no tag in the shop is dead. A bare id
 * is accepted too, for anyone encoding their own.
 */
export function stockIdFromScan(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null

  const fromPath = (path: string): string | null => {
    const match = path.match(
      /\/(?:s|q)\/([A-Za-z0-9_-]+)|\/inventory\/stock\/([A-Za-z0-9_-]+)/,
    )
    return match ? (match[1] ?? match[2] ?? null) : null
  }

  try {
    // Absolute URL — the usual case, since the label encodes a full link.
    return fromPath(new URL(value).pathname)
  } catch {
    // Not a URL: either a bare path or a bare id.
    if (value.startsWith("/")) return fromPath(value)
    return /^[A-Za-z0-9_-]{8,}$/.test(value) ? value : null
  }
}

/** Holding a tag in frame yields many reads a second; take one. */
const REPEAT_SUPPRESSION_MS = 2500

export function WebcamQrScanner({
  onScanned,
  onClose,
}: {
  onScanned: (stockId: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const lastRef = useRef<{ value: string; at: number } | null>(null)
  const onScannedRef = useRef(onScanned)
  onScannedRef.current = onScanned

  const [status, setStatus] = useState<"starting" | "scanning" | "error">(
    "starting",
  )
  const [message, setMessage] = useState<string | null>(null)
  const [lastCode, setLastCode] = useState<string | null>(null)

  const handleValue = useCallback((raw: string) => {
    const stockId = stockIdFromScan(raw)
    if (!stockId) return

    const now = Date.now()
    const previous = lastRef.current

    // Same tag still in frame — not a second piece.
    if (previous && previous.value === stockId && now - previous.at < REPEAT_SUPPRESSION_MS) {
      return
    }

    lastRef.current = { value: stockId, at: now }
    setLastCode(stockId)
    onScannedRef.current(stockId)
  }, [])

  useEffect(() => {
    let cancelled = false
    let frame = 0
    let detector: BarcodeDetectorLike | null = null

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("error")
        setMessage(
          "This browser cannot open a camera. Use the phone option instead.",
        )
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // Prefers a rear camera where there is one, which is what a tablet
          // at the counter would use; a laptop simply has the one.
          video: { facingMode: "environment" },
        })

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream

        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => {})
        }

        if (window.BarcodeDetector) {
          try {
            detector = new window.BarcodeDetector({ formats: ["qr_code"] })
          } catch {
            detector = null
          }
        }

        setStatus("scanning")
        scan()
      } catch (error) {
        if (cancelled) return
        setStatus("error")
        setMessage(
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "Camera permission was refused. Allow it in your browser, then try again."
            : "Could not open the camera. It may be in use by another program.",
        )
      }
    }

    async function scan() {
      if (cancelled) return

      const video = videoRef.current
      const canvas = canvasRef.current

      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        try {
          if (detector) {
            const found = await detector.detect(video)
            if (found.length > 0) handleValue(found[0].rawValue)
          } else {
            const width = video.videoWidth
            const height = video.videoHeight

            if (width && height) {
              canvas.width = width
              canvas.height = height

              const context = canvas.getContext("2d", { willReadFrequently: true })
              if (context) {
                context.drawImage(video, 0, 0, width, height)
                const image = context.getImageData(0, 0, width, height)

                // Loaded here rather than at module scope so the decoder is
                // only downloaded by someone who actually opens the camera.
                const { default: jsQR } = await import("jsqr")
                const result = jsQR(image.data, width, height, {
                  inversionAttempts: "dontInvert",
                })

                if (result?.data) handleValue(result.data)
              }
            }
          }
        } catch {
          // A dropped frame is not worth reporting; the next one follows.
        }
      }

      frame = requestAnimationFrame(scan)
    }

    start()

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      // Releases the camera light as well as the device — leaving it on
      // after the panel closes looks like the app is still watching.
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [handleValue])

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Camera scanning</p>
          <p className="text-xs text-muted-foreground">
            Hold a tag in front of the camera. Each new tag is added as a line.
          </p>
        </div>

        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          <X className="mr-1.5 size-3.5" />
          Close
        </Button>
      </div>

      <div className="relative mt-3 overflow-hidden rounded-md bg-black">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          className="h-56 w-full object-cover"
          muted
          playsInline
        />

        <canvas ref={canvasRef} className="hidden" />

        {status === "starting" ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 text-sm text-white">
            <Loader2 className="size-4 animate-spin" />
            Opening camera...
          </div>
        ) : null}

        {status === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 px-6 text-center text-sm text-white">
            <CameraOff className="size-6" />
            {message}
          </div>
        ) : null}

        {status === "scanning" ? (
          // A frame to aim at: without one people hold the tag too far off
          // centre for the decoder to read it.
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="size-36 rounded-lg border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
        ) : null}
      </div>

      {lastCode ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Last read: <span className="font-mono">{lastCode}</span>
        </p>
      ) : null}
    </div>
  )
}
