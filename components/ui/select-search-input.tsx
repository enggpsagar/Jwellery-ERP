"use client"

import * as React from "react"

import { Input } from "@/components/ui/input"

/**
 * The search box at the top of a searchable <Select> (stock, party, product,
 * location, ...). Radix Select manages focus for its items: on open it
 * focuses the selected item, hovering an item focuses it, and when the
 * filtered list re-renders the focused item can vanish — each time the
 * cursor left the search box after a few characters. This keeps it there:
 * focus on open, and any blur onto an item (or into nowhere) while the list
 * is open is undone on the next frame. Clicking an item still selects it
 * (Radix selects on pointer-up); keystrokes don't reach Radix's typeahead.
 */
export const SelectSearchInput = React.forwardRef<HTMLInputElement, React.ComponentProps<typeof Input>>(
  function SelectSearchInput({ onKeyDown, onBlur, ...props }, forwardedRef) {
    const ref = React.useRef<HTMLInputElement | null>(null)
    React.useImperativeHandle(forwardedRef, () => ref.current as HTMLInputElement)

    const refocus = React.useCallback(() => {
      requestAnimationFrame(() => {
        const input = ref.current
        if (!input || !input.isConnected || document.activeElement === input) return
        const active = document.activeElement as HTMLElement | null
        // Another real field (e.g. an "add new" dialog) may take focus.
        if (active && active !== document.body && !active.closest('[role="option"], [role="listbox"]')) return
        const end = input.value.length
        input.focus({ preventScroll: true })
        input.setSelectionRange(end, end)
      })
    }, [])

    // Radix focuses the selected item right after opening; take it back.
    React.useEffect(() => {
      const timer = setTimeout(refocus, 0)
      return () => clearTimeout(timer)
    }, [refocus])

    // A re-filtered list can unmount the focused item.
    React.useEffect(() => {
      refocus()
    }, [props.value, refocus])

    return (
      <Input
        ref={ref}
        autoComplete="off"
        {...props}
        onKeyDown={(event) => {
          // Keep Radix's typeahead / item navigation from eating keystrokes.
          event.stopPropagation()
          onKeyDown?.(event)
        }}
        onBlur={(event) => {
          onBlur?.(event)
          const next = event.relatedTarget as HTMLElement | null
          if (!next || next.closest('[role="option"], [role="listbox"]')) refocus()
        }}
      />
    )
  },
)
