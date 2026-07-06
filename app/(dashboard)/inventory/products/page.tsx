import { getProducts } from "@/lib/actions/inventory/product-actions"
import { AddProductDialog } from "@/components/inventory/products/add-product-dialog"
import { ProductsTable } from "@/components/inventory/products/products-table"
import { PageBackHeader } from "@/components/shared/page-back-header"

export default async function InventoryProductsPage() {
  const products = await getProducts()

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Products"
        description="Manage jewellery product masters."
        backHref="/inventory"
        backLabel="Back to Inventory"
        action={<AddProductDialog />}
      />

      <ProductsTable products={products} />
    </main>
  )
}