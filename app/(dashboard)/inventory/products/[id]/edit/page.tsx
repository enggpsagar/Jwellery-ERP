// app/inventory/products/[id]/edit/page.tsx

import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { getProductById } from "@/lib/actions/inventory/product-actions"
import { hasPermission } from "@/lib/auth/auth"
import { PERMISSIONS } from "@/lib/permissions"
import {
  getStoreCategories,
  getStoreMetals,
} from "@/lib/actions/taxonomy-actions"
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

  // Hiding the Edit button on the detail page is presentation only —
  // anyone can still type this URL, so the permission is enforced here too.
  // Sent to the read-only view rather than a dead end: the user is allowed
  // to see the product, just not change it.
  if (!(await hasPermission(PERMISSIONS.PRODUCT_UPDATE))) {
    redirect(`/inventory/products/${id}`)
  }

  const [product, metals, categories] = await Promise.all([
    getProductById(id),
    getStoreMetals(),
    getStoreCategories(),
  ])

  if (!product) {
    notFound()
  }

  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2">
            <Link
              href={`/inventory/products/${id}`}
              className="text-sm text-blue-600 hover:underline"
            >
              ← Back to Product
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

      <EditProductForm product={product} metals={metals} categories={categories} />
    </main>
  )
}