import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"

import { getProductById } from "@/lib/actions/inventory/product-actions"
import { hasPermission } from "@/lib/auth/auth"
import { PERMISSIONS } from "@/lib/permissions"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

type Props = {
  params: Promise<{ id: string }>
}

/**
 * Read-only counterpart to the create/edit form. Every field captured on
 * Add Product appears here, grouped into the same four sections the form
 * uses, so the three screens describe the same product the same way.
 */
function Field({
  label,
  value,
  className = "",
}: {
  label: string
  value: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 font-medium break-words">{value || "—"}</div>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card p-6">
      <h3 className="mb-6 text-lg font-semibold">{title}</h3>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  )
}

/** "₹500" or "5%" — a bare number hides which of the two it is. */
function formatCharge(
  amount: string | null,
  type: "FIXED" | "PERCENTAGE" | string,
) {
  if (amount === null || amount === "") return null

  const number = Number(amount)
  if (Number.isNaN(number)) return amount

  return type === "PERCENTAGE"
    ? `${number}%`
    : `₹${number.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}

export default async function ProductDetailsPage({ params }: Props) {
  const { id } = await params

  const [product, canEdit] = await Promise.all([
    getProductById(id),
    hasPermission(PERMISSIONS.PRODUCT_UPDATE),
  ])

  if (!product) notFound()

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={product.name}
        description={`Product Code: ${product.productCode}`}
        backHref="/inventory/products"
        backLabel="Back to Products"
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

      <Section title="Basic Information">
        <Field label="Product Code" value={product.productCode} />
        <Field label="Product Name" value={product.name} />
        <Field label="Category" value={product.category?.name} />
        <Field label="Item Type" value={product.categoryType?.name} />
        <Field
          label="Status"
          value={
            <Badge variant={product.isActive ? "default" : "secondary"}>
              {product.isActive ? "Active" : "Inactive"}
            </Badge>
          }
        />
      </Section>

      <Section title="Metal Details">
        <Field label="Metal Type" value={product.metalType?.name} />
        <Field
          label="Default Purity"
          value={product.defaultPurity?.replaceAll("_", " ")}
        />
      </Section>

      <Section title="Default Charges">
        <Field
          label="Making Charge"
          value={formatCharge(
            product.defaultMakingCharge,
            product.defaultMakingChargeType,
          )}
        />
        <Field
          label="Making Charge Type"
          value={
            product.defaultMakingChargeType === "PERCENTAGE"
              ? "Percentage"
              : "Fixed"
          }
        />
        <Field
          label="Stone Charge"
          value={formatCharge(
            product.defaultStoneCharge,
            product.defaultStoneChargeType,
          )}
        />
        <Field
          label="Stone Charge Type"
          value={
            product.defaultStoneChargeType === "PERCENTAGE"
              ? "Percentage"
              : "Fixed"
          }
        />
      </Section>

      <Section title="Product Details">
        <Field label="Design Code" value={product.designCode} />
        <Field label="HSN Code" value={product.hsnCode} />
        <Field label="Created" value={formatDate(product.createdAt)} />
        <Field label="Last Updated" value={formatDate(product.updatedAt)} />
      </Section>

      <Section title="Additional Information">
        <Field
          label="Description"
          value={
            product.description ? (
              <span className="whitespace-pre-wrap">{product.description}</span>
            ) : null
          }
          className="sm:col-span-2 lg:col-span-3"
        />
        <Field
          label="Internal Notes"
          value={
            product.notes ? (
              <span className="whitespace-pre-wrap">{product.notes}</span>
            ) : null
          }
          className="sm:col-span-2 lg:col-span-3"
        />
      </Section>
    </main>
  )
}
