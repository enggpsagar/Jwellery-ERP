import { Download } from "lucide-react"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { TopBar } from "@/components/dashboard/top-bar"
import { LedgerView } from "@/components/ledger/ledger-view"

export default function LedgerPage() {
  return (
    <SidebarProvider>
      <SidebarInset>
        <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold tracking-tight text-balance">
                Gold &amp; Silver Ledger
              </h1>
              <p className="text-sm text-muted-foreground">
                Track metal receipts, issues and running balances across all accounts.
              </p>
            </div>
            <Button variant="outline" className="sm:self-start">
              <Download data-icon="inline-start" />
              Export Ledger
            </Button>
          </div>

          <LedgerView />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
