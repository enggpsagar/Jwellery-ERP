import {
  getPurchaseFormVendors,
  getPurchaseFormProducts,
} from "@/lib/actions/purchase-actions"

import { PurchaseForm } from "@/components/purchases/purchase-form"
import { PageBackHeader } from "@/components/shared/page-back-header"

export default async function NewPurchasePage() {
  const [vendors, products] = await Promise.all([
    getPurchaseFormVendors(),
    getPurchaseFormProducts(),
  ])

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="New Purchase"
        description="Buy stock from a vendor — every line item adds new inventory."
        backHref="/purchases"
        backLabel="Back to Purchases"
      />

      <PurchaseForm vendors={vendors} products={products} />
    </main>
  )
}
