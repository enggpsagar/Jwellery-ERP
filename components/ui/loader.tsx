"use client"

import { useId } from "react"

import { cn } from "@/lib/utils"

/**
 * The app's loading indicator — an infinity-shaped track with a gradient
 * "comet" segment travelling around it (replaces the generic spinning-icon
 * loader used everywhere before). Colours come from the theme tokens
 * (--primary burgundy -> --chart-2 gold), so it always matches the current
 * theme without hardcoding a palette here.
 *
 * `pathLength={1}` normalises the SVG path to a length of 1 regardless of
 * its actual geometry, so the dash array/animation below is exact math
 * (a 28%-of-track comet) rather than a guessed pixel length.
 */
export function Loader({ className }: { className?: string }) {
  const gradientId = useId()

  return (
    <svg
      viewBox="0 0 100 50"
      className={cn("h-6 w-6", className)}
      role="status"
      aria-label="Loading"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--primary)" />
          <stop offset="100%" stopColor="var(--chart-2)" />
        </linearGradient>
      </defs>

      {/* Faint full track, so the comet always has a visible path to run along. */}
      <path
        d="M 20,25 C 20,10 40,10 50,25 C 60,40 80,40 80,25 C 80,10 60,10 50,25 C 40,40 20,40 20,25 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
        opacity="0.15"
      />

      <path
        d="M 20,25 C 20,10 40,10 50,25 C 60,40 80,40 80,25 C 80,10 60,10 50,25 C 40,40 20,40 20,25 Z"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="8"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="0.28 1"
        className="animate-loader-infinity"
      />
    </svg>
  )
}
