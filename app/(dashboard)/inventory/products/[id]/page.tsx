import type { Metadata } from "next"
import { cache } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"

import { getProductById } from "@/lib/actions/inventory/product-actions"
import { hasPermission } from "@/lib/auth/auth"
import { resolveBackLink } from "@/lib/safe-return-to"
import { PERMISSIONS } from "@/lib/permissions"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { Button } from "@/components/ui/button"
import { ProductDetailContent } from "@/components/inventory/products/product-detail-content"

type Props = {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ from?: string }>
}

const getProduct = cache(getProductById)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params
    const product = await getProduct(id)
    return { title: product?.name ?? "Product" }
  } catch {
    return { title: "Product" }
  }
}

export default async function ProductDetailsPage({ params, searchParams }: Props) {
  const { id } = await params

  // Products are opened from the catalogue and from a stock row, so "back"
  // follows whoever linked here rather than always the products list.
  const backTo = resolveBackLink((await searchParams)?.from, {
    href: "/inventory/products",
    label: "Back to Products",
  })

  const [product, canEdit] = await Promise.all([
    getProduct(id),
    hasPermission(PERMISSIONS.PRODUCT_UPDATE),
  ])

  if (!product) notFound()

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={product.name}
        description={`Product Code: ${product.productCode}`}
        backHref={backTo.href}
        backLabel={backTo.label}
        action={
          // Editing is gated on PRODUCT_UPDATE. Without it the page still
          // shows everything — it just offers no way through to the form,
          // which refuses the same permission server-side.
          canEdit ? (
            <Button asChild>
              <Link href={`/inventory/products/${product.id}/edit`}>
                <Pencil className="mr-1 h-4 w-4" />
                Edit Product
              </Link>
            </Button>
          ) : undefined
        }
      />

      {!canEdit && (
        <p className="rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
          You have view-only access to products. Ask your Store Owner if you
          need to change these details.
        </p>
      )}

      <ProductDetailContent product={product} />
    </main>
  )
}
