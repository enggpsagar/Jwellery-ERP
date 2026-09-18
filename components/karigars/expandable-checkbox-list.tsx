"use client"

import * as React from "react"

const VISIBLE_LIMIT = 5

type ExpandableCheckboxListItem = {
  id: string
  name: string
}

/**
 * Read-only checkbox list for the Metal/Stone cards on an artisan's detail
 * view — caps the list at 5 items with a "View More" toggle rather than
 * always rendering every assigned metal/stone, since a store with a long
 * catalog otherwise pushes the card (and the rest of the grid below it)
 * arbitrarily tall. Client-only for the expand/collapse state; the parent
 * grid/cards around this stay server-rendered.
 */
export function ExpandableCheckboxList({
  items,
  checkedIds,
}: {
  items: ExpandableCheckboxListItem[]
  checkedIds: string[]
}) {
  const [expanded, setExpanded] = React.useState(false)

  const visibleItems = expanded ? items : items.slice(0, VISIBLE_LIMIT)
  const hiddenCount = items.length - VISIBLE_LIMIT

  return (
    <div className="space-y-1.5">
      {visibleItems.map((item) => (
        <label key={item.id} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={checkedIds.includes(item.id)}
            disabled
            className="h-4 w-4 shrink-0"
          />
          {/* min-w-0 lets this flex item shrink below its single-word
              content size (flex items default to min-width: auto), and
              break-words gives that word somewhere to go instead of
              overflowing the card's clipped edge -- this card renders
              inside the narrow Karigars master-detail side panel as well
              as the full-width standalone page, so a long gemstone name
              (Aquamarine, Tanzanite...) can end up far narrower than its
              own text here. */}
          <span className="min-w-0 break-words">{item.name}</span>
        </label>
      ))}

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="text-sm font-medium text-primary hover:underline"
        >
          {expanded ? "View Less" : `View More (+${hiddenCount})`}
        </button>
      )}
    </div>
  )
}
