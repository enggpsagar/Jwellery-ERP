import type { Metadata } from "next"
import Link from "next/link"
import { InvoiceStatus } from "@prisma/client"

import { getPurchases } from "@/lib/actions/purchase-actions"
import { PurchaseTable } from "@/components/purchases/purchase-table"
import { PurchasesToolbar } from "@/components/purchases/purchases-toolbar"
import { DataTablePagination } from "@/components/shared/data-table-pagination"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Purchases",
}

type PurchasesPageProps = {
  searchParams?: Promise<{
    page?: string
    pageSize?: string
    search?: string
    sortBy?: "purchaseDate" | "purchaseNumber" | "totalAmount"
    sortOrder?: "asc" | "desc"
    status?: string
  }>
}

export const dynamic = "force-dynamic"

export default async function PurchasesPage({ searchParams }: PurchasesPageProps) {
  const params = (await searchParams) ?? {}

  const page = Number(params.page || 1)
  const pageSize = Number(params.pageSize || 10)
  const search = params.search || ""
  const sortBy = params.sortBy || "purchaseDate"
  const sortOrder = params.sortOrder || "desc"
  const isValidStatus = (Object.values(InvoiceStatus) as string[]).includes(params.status ?? "")
  const status = isValidStatus ? (params.status as InvoiceStatus) : "ALL"

  const { purchases, pagination } = await getPurchases({
    page,
    pageSize,
    search,
    sortBy,
    sortOrder,
    status,
  })

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Purchases"
        description="Record vendor purchases and bring new stock into inventory."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
        action={
          <Link href="/purchases/new">
            <Button>New Purchase</Button>
          </Link>
        }
      />

      <PurchasesToolbar />

      <div>
        <PurchaseTable purchases={purchases} />
        <DataTablePagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalCount={pagination.totalCount}
          pageSize={pagination.pageSize}
          itemLabel="purchases"
        />
      </div>
    </main>
  )
}
