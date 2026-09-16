"use client"

import * as React from "react"
import { Search, X } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type CollapsibleSearchProps = {
  value: string
  onChange: (value: string) => void
  placeholder: string
  disabled?: boolean
  /** Accessible label for the collapsed icon-only button — defaults to the placeholder. */
  label?: string
}

/**
 * A search box that starts as just an icon button — clicking it opens the
 * actual input, auto-focused — and collapses back to the icon once it
 * loses focus with nothing typed. Frees up real toolbar width on every list
 * page (Products/Stock/Purchases/...) whose filters (Status, Type, date
 * range, page-size) already compete for space with a permanently-open
 * search field. Starts open when a search is already active (from the URL,
 * a page refresh, ...) so an in-progress filter never silently vanishes on
 * you.
 */
export function CollapsibleSearch({
  value,
  onChange,
  placeholder,
  disabled,
  label,
}: CollapsibleSearchProps) {
  const [expanded, setExpanded] = React.useState(() => Boolean(value))
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (value) setExpanded(true)
  }, [value])

  if (!expanded) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={() => {
          setExpanded(true)
          // Focus lands after the input actually mounts.
          requestAnimationFrame(() => inputRef.current?.focus())
        }}
        title={label ?? placeholder}
        aria-label={label ?? placeholder}
      >
        <Search className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <div className="relative min-w-[120px] flex-1 sm:max-w-44">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (!value) setExpanded(false)
        }}
        placeholder={placeholder}
        className="h-9 pl-9 pr-8"
        disabled={disabled}
      />
      {value ? (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange("")
            setExpanded(false)
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          title="Clear search"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  )
}
