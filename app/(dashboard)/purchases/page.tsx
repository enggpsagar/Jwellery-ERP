import Link from "next/link"

import { getPurchases } from "@/lib/actions/purchase-actions"
import { PurchaseTable } from "@/components/purchases/purchase-table"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { Button } from "@/components/ui/button"

export default async function PurchasesPage() {
  const { purchases } = await getPurchases()

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

      <PurchaseTable purchases={purchases} />
    </main>
  )
}
