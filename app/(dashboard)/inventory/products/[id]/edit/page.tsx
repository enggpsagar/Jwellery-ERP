// app/inventory/products/[id]/edit/page.tsx

import Link from "next/link"
import { notFound } from "next/navigation"

import { getProductById } from "@/lib/actions/inventory/product-actions"
import { EditProductForm } from "@/components/inventory/products/edit-product-form"

type ProductEditPageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function ProductEditPage({
  params,
}: ProductEditPageProps) {
  const { id } = await params
  const product = await getProductById(id)

  if (!product) {
    notFound()
  }

  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2">
            <Link
              href="/inventory/products"
              className="text-sm text-blue-600 hover:underline"
            >
              ← Back to Products
            </Link>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">
            Edit Product
          </h1>
          <p className="text-sm text-muted-foreground">
            Update jewellery product master details.
          </p>
        </div>
      </div>

      <EditProductForm product={product} />
    </main>
  )
}