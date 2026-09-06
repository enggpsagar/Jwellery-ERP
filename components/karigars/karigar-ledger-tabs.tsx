"use client"

import { useState } from "react"

import type { KarigarLedgerRow, KarigarLedgerMetalGroup } from "@/lib/actions/ledger-actions"
import { KarigarLedgerTable } from "@/components/karigars/karigar-ledger-table"

const TABS = [
  { key: "financial", label: "Financial Ledger" },
  { key: "material", label: "Material Ledger" },
] as const

type TabKey = (typeof TABS)[number]["key"]

type KarigarLedgerTabsProps = {
  rows: KarigarLedgerRow[]
  finalCashBalance: number
  totalDebit: number
  totalCredit: number
  materialGroups: KarigarLedgerMetalGroup[]
}

export function KarigarLedgerTabs({
  rows,
  finalCashBalance,
  totalDebit,
  totalCredit,
  materialGroups,
}: KarigarLedgerTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("financial")

  return (
    <div className="flex flex-col gap-4">
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

      <KarigarLedgerTable
        rows={rows}
        finalCashBalance={finalCashBalance}
        totalDebit={totalDebit}
        totalCredit={totalCredit}
        materialGroups={materialGroups}
        variant={activeTab}
      />
    </div>
  )
}
