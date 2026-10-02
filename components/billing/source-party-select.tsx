"use client"

import { useMemo, useState } from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"

export type SourcePartyOption = { id: string; name: string; phone: string | null }

/** Sentinel for "not recorded" — Radix Select can't hold an empty value. */
const NONE_VALUE = "__none__"

/**
 * "Purchased From" picker for a "Create New Line Item" line — who the piece
 * (and its metal) came in from, saved onto the stock row minted for it
 * (InventoryStock.vendorId/vendorName, the same columns a Purchase fills).
 *
 * Deliberately not CustomerSelect: that one reacts to the `newCustomerId`
 * return param and writes a hidden `customerId` input, so one per line
 * would grab the invoice's own newly-added party and collide with its
 * field. The list itself comes from getSupplierOptions() — Suppliers only
 * when the Supplier module is on, every party when it's off.
 */
export function SourcePartySelect({
  parties,
  value,
  onChange,
  termLabel,
}: {
  parties: SourcePartyOption[]
  value: string
  onChange: (partyId: string) => void
  termLabel: "supplier" | "party"
}) {
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return parties
    return parties.filter(
      (party) =>
        party.name.toLowerCase().includes(query) || (party.phone ?? "").toLowerCase().includes(query),
    )
  }, [parties, search])

  return (
    <Select value={value || NONE_VALUE} onValueChange={(next) => onChange(next === NONE_VALUE ? "" : next)}>
      <SelectTrigger className="h-11 w-full">
        <SelectValue placeholder={`Select a ${termLabel}`} />
      </SelectTrigger>
      <SelectContent>
        <div className="p-2">
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
          />
        </div>
        <SelectItem value={NONE_VALUE}>Not recorded</SelectItem>
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            No {termLabel === "supplier" ? "suppliers" : "parties"} found{search ? ` for "${search}"` : ""}
          </div>
        ) : (
          filtered.map((party) => (
            <SelectItem key={party.id} value={party.id}>
              {party.name}{" "}
              {party.phone ? <span className="text-muted-foreground">({party.phone})</span> : null}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  )
}
