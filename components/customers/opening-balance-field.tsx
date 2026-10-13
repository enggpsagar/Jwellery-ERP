"use client"

import { useState } from "react"
import { IndianRupee } from "lucide-react"

import { cn } from "@/lib/utils"
import type { OpeningBalanceType } from "@/lib/party-balance"

const FIELD = "w-full rounded-md border bg-background px-3 py-2 text-sm"

/**
 * Opening balance as an amount plus an explicit Receivable / Payable choice
 * (the party owes you / you owe the party). Posts `openingBalance` (always
 * ≥ 0) and `openingBalanceType`; the action stores it signed
 * (lib/party-balance.ts). `defaultValue` is the stored signed figure.
 */
export function OpeningBalanceField({ defaultValue = 0 }: { defaultValue?: number }) {
  const [type, setType] = useState<OpeningBalanceType>(defaultValue < 0 ? "PAYABLE" : "RECEIVABLE")
  const amount = Math.abs(Number(defaultValue) || 0)

  return (
    <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
      <label htmlFor="openingBalance" className="flex items-center gap-2 text-sm font-medium">
        <IndianRupee className="h-4 w-4 text-muted-foreground" />
        Opening Balance
      </label>
      <div className="flex gap-2">
        <input
          id="openingBalance"
          name="openingBalance"
          type="number"
          step="0.01"
          min="0"
          className={FIELD}
          placeholder="0.00"
          defaultValue={amount || undefined}
        />
        <input type="hidden" name="openingBalanceType" value={type} />
        <div role="radiogroup" aria-label="Opening balance type" className="flex shrink-0 overflow-hidden rounded-md border">
          {(
            [
              ["RECEIVABLE", "Receivable"],
              ["PAYABLE", "Payable"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={type === value}
              onClick={() => setType(value)}
              className={cn(
                "px-3 text-sm transition-colors",
                type === value
                  ? value === "RECEIVABLE"
                    ? "bg-red-50 font-medium text-red-700"
                    : "bg-blue-50 font-medium text-blue-700"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {type === "RECEIVABLE" ? "The party owed you this when you started." : "You owed the party this when you started."}
      </p>
    </div>
  )
}
