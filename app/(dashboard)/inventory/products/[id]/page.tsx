import { notFound } from "next/navigation"
import { getProductById } from "@/lib/actions/inventory/product-actions"
import { PageBackHeader } from "@/components/shared/page-back-header"

type Props = {
  params: Promise<{ id: string }>
}

export default async function ProductDetailsPage({ params }: Props) {
  const { id } = await params
  const product = await getProductById(id)

  if (!product) notFound()

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={product.name}
        description={`Product Code: ${product.productCode}`}
        backHref="/inventory/products"
        backLabel="Back to Products"
      />

      <div className="rounded-xl border bg-white p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">Category</p>
            <p className="font-medium">{product.category}</p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">Metal Type</p>
            <p className="font-medium">{product.metalType}</p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">Ornament Type</p>
            <p className="font-medium">{product.ornamentType ?? "-"}</p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">Default Purity</p>
            <p className="font-medium">{product.defaultPurity ?? "-"}</p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">Design Code</p>
            <p className="font-medium">{product.designCode ?? "-"}</p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">HSN Code</p>
            <p className="font-medium">{product.hsnCode ?? "-"}</p>
          </div>
        </div>
      </div>
    </main>
  )
}