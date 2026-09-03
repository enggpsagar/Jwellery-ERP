"use client"

import type { PartyGstType } from "@prisma/client"

import { PARTY_GST_TYPE_OPTIONS } from "@/lib/gst"

/**
 * The 3-way GST registration picker for a Customer or Vendor's OWN status —
 * separate from (and never driven by) the store's own GstScheme in
 * Settings. See PartyGstType's doc comment in schema.prisma.
 */
export function PartyGstTypeSelect({
  value,
  onChange,
  name = "gstType",
}: {
  value: PartyGstType
  onChange: (value: PartyGstType) => void
  name?: string
}) {
  const selected = PARTY_GST_TYPE_OPTIONS.find((option) => option.value === value)

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {PARTY_GST_TYPE_OPTIONS.map((option) => (
          <label key={option.value} className="flex items-center gap-1.5 text-xs font-medium">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="h-3.5 w-3.5 border-input"
            />
            {option.label}
          </label>
        ))}
      </div>

      {selected ? <p className="text-xs text-muted-foreground">{selected.description}</p> : null}
    </div>
  )
}
