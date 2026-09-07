"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { InvoiceTable } from "@/components/billing/invoice-table"
import { InvoicesToolbar } from "@/components/billing/invoices-toolbar"
import { InvoiceDetailPanel } from "@/components/billing/invoice-detail-panel"
import { DataTablePagination } from "@/components/shared/data-table-pagination"
import type { LocationOption } from "@/components/shared/location-select"

type InvoiceRow = {
  id: string
  invoiceNumber: string
  invoiceDate: string
  status: string
  totalAmount: number
  balanceAmount: number
  customer: { id: string; name: string; phone: string | null } | null
  convertedFromKacha: { id: string; slipNumber: string } | null
}

type InvoicesClientProps = {
  invoices: InvoiceRow[]
  locations: LocationOption[]
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
  }
}

/**
 * Master-detail layout, same pattern as CustomersClient/PurchasesClient —
 * the list on the left stays a plain table/toolbar/pagination stack, and
 * clicking a row shows its full detail (every action Invoice already had:
 * Print, WhatsApp, Email, Edit, Edit Items, Cancel, Return, Record
 * Payment) in the panel on the right, instead of every action requiring a
 * full navigation.
 */
export function InvoicesClient({ invoices, locations, pagination }: InvoicesClientProps) {
  // Defaults to the first row on this page/search result so the panel is
  // never empty on load, matching CustomersClient/PurchasesClient.
  const [activeInvoiceId, setActiveInvoiceId] = React.useState<string | null>(
    invoices[0]?.id ?? null,
  )

  React.useEffect(() => {
    setActiveInvoiceId((current) => {
      if (current && invoices.some((invoice) => invoice.id === current)) return current
      return invoices[0]?.id ?? null
    })
  }, [invoices])

  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Billing</h1>
          <p className="text-sm text-muted-foreground">
            Showing {invoices.length} of {pagination.totalCount} invoices
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/billing/kacha">
            <Button variant="outline">Kacha Slips</Button>
          </Link>
          <Link href="/billing/new">
            <Button>New Invoice</Button>
          </Link>
        </div>
      </div>

      {/* List + detail side by side, matching the Customers/Purchases
          pages' own layout — stacks on narrow viewports since there's no
          room for both. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
        <div className="space-y-4">
          <InvoicesToolbar />

          <InvoiceTable
            invoices={invoices}
            activeInvoiceId={activeInvoiceId}
            onActivate={setActiveInvoiceId}
          />

          {invoices.length > 0 ? (
            <DataTablePagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              totalCount={pagination.totalCount}
              pageSize={pagination.pageSize}
              itemLabel="invoices"
            />
          ) : null}
        </div>

        <InvoiceDetailPanel invoiceId={activeInvoiceId} locations={locations} />
      </div>
    </main>
  )
}
