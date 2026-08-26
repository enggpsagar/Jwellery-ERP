"use client"

import { useState } from "react"

import type { LedgerEntryRow, LedgerTotals, MetalDailyLedgerResult } from "@/lib/actions/ledger-actions"
import { LedgerView } from "@/components/ledger/ledger-view"
import { MetalDailyLedger } from "@/components/ledger/metal-daily-ledger"

const TABS = [
  { key: "entries", label: "Ledger Entries" },
  { key: "metalWise", label: "Metal-wise" },
] as const

type TabKey = (typeof TABS)[number]["key"]

type LedgerTabsProps = {
  entries: LedgerEntryRow[]
  totals: LedgerTotals
  metalDaily: MetalDailyLedgerResult
}

export function LedgerTabs({ entries, totals, metalDaily }: LedgerTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("entries")

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2 border-b">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "entries" ? (
        <LedgerView entries={entries} totals={totals} />
      ) : (
        <MetalDailyLedger data={metalDaily} />
      )}
    </div>
  )
}
