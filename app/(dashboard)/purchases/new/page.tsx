import {
  getPurchaseFormVendors,
  getPurchaseFormProducts,
} from "@/lib/actions/purchase-actions"
import { getStoreMetals, getStoreCategories } from "@/lib/actions/taxonomy-actions"

import { PurchaseForm } from "@/components/purchases/purchase-form"
import { PageBackHeader } from "@/components/shared/page-back-header"

export default async function NewPurchasePage() {
  // Metals and categories are only needed by the "New product" quick-add
  // dialog, but they're fetched here with everything else so the dialog
  // opens instantly instead of loading its dropdowns on first click.
  const [vendors, products, metals, categories] = await Promise.all([
    getPurchaseFormVendors(),
    getPurchaseFormProducts(),
    getStoreMetals(),
    getStoreCategories(),
  ])

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="New Purchase"
        description="Buy stock from a vendor — every line item adds new inventory."
        backHref="/purchases"
        backLabel="Back to Purchases"
      />

      <PurchaseForm
        vendors={vendors}
        products={products}
        metals={metals.map((metal) => ({ id: metal.id, name: metal.name }))}
        categories={categories.map((category) => ({
          id: category.id,
          name: category.name,
        }))}
      />
    </main>
  )
}
