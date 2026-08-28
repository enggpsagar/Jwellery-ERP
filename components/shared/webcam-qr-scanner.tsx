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

/** Remembered per browser, so the scanner is not re-chosen every sale. */
const CAMERA_PREFERENCE_KEY = "stock-scanner-camera-id"

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

  // A counter often has two cameras — the laptop's own, facing the operator,
  // and a scanner pointed at the desk. The browser picks one for you, and on
  // a desktop `facingMode` gives it nothing to go on, so the choice has to be
  // the operator's and has to stick.
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    try {
      return window.localStorage.getItem(CAMERA_PREFERENCE_KEY)
    } catch {
      // Private browsing and blocked storage both throw; the picker still
      // works, it just will not be remembered.
      return null
    }
  })

  const selectDevice = useCallback((next: string) => {
    setDeviceId(next)
    try {
      window.localStorage.setItem(CAMERA_PREFERENCE_KEY, next)
    } catch {
      // Not worth surfacing — the camera still switches for this session.
    }
  }, [])

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
        // An exact deviceId when one has been chosen, so the choice is
        // honoured rather than treated as a hint. Otherwise fall back to
        // preferring a rear camera, which is what a tablet at the counter
        // would use; a laptop simply has the one.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: "environment" },
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

        // Labels are blank until a camera has been granted, so the list is
        // only worth reading after the stream is open — before that every
        // entry would say "camera" and be impossible to choose between.
        try {
          const all = await navigator.mediaDevices.enumerateDevices()
          if (!cancelled) {
            setDevices(all.filter((device) => device.kind === "videoinput"))
          }
        } catch {
          // Without the list there is no picker, but scanning still works.
        }

        setStatus("scanning")
        scan()
      } catch (error) {
        if (cancelled) return
        // A remembered camera that has since been unplugged fails with
        // OverconstrainedError. Forget it and let the next attempt take
        // whatever is actually attached, rather than stranding the panel.
        if (error instanceof DOMException && error.name === "OverconstrainedError" && deviceId) {
          try {
            window.localStorage.removeItem(CAMERA_PREFERENCE_KEY)
          } catch {
            // Ignored; clearing state below is what matters.
          }
          setDeviceId(null)
          return
        }

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
    // Re-runs on a camera change: the cleanup below stops the old stream
    // first, so the two never hold the device at once.
  }, [handleValue, deviceId])

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

      {/* Sized to the sensor's own 4:3 rather than to a strip, and as large
          as the column allows. A short full-width band cropped most of the
          frame away; a small one threw away the resolution the decoder needs
          to read a tag from arm's length. */}
      <div className="relative mx-auto mt-3 aspect-[4/3] w-full max-w-3xl overflow-hidden rounded-md bg-black">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        {/* `contain`, not `cover`: nothing the camera sees is cropped out of
            view, so what is on screen is exactly what the decoder is given.
            A camera that is not 4:3 letterboxes rather than losing edges. */}
        <video
          ref={videoRef}
          className="h-full w-full object-contain"
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
            {/* Sized as a share of the viewport rather than in pixels, so it
                stays a sensible target on a large screen and a small one. A
                cramped target makes people bring the label closer than a
                fixed-focus camera can resolve. */}
            <div className="aspect-square h-[70%] rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.3)]" />
          </div>
        ) : null}
      </div>

      {devices.length > 1 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label
            htmlFor="scanner-camera"
            className="text-xs text-muted-foreground"
          >
            Camera
          </label>
          <select
            id="scanner-camera"
            className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-xs"
            value={deviceId ?? devices[0]?.deviceId ?? ""}
            onChange={(event) => selectDevice(event.target.value)}
          >
            {devices.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Camera ${index + 1}`}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {lastCode ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Last read: <span className="font-mono">{lastCode}</span>
        </p>
      ) : null}
    </div>
  )
}
