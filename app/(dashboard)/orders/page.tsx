import type { Metadata } from "next"
import Link from "next/link"

import { getDraftOrders } from "@/lib/actions/draft-order-actions"
import { DraftOrdersTable } from "@/components/orders/draft-orders-table"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Draft Orders",
}

export const dynamic = "force-dynamic"

export default async function DraftOrdersPage() {
  const orders = await getDraftOrders()

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Draft Orders"
        description="Phone/counter orders — capture what a customer wants, send it to an artisan, and it becomes real Product & Inventory once received."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
        action={
          <Link href="/orders/new">
            <Button>New Draft Order</Button>
          </Link>
        }
      />

      <DraftOrdersTable orders={orders} />
    </main>
  )
}
