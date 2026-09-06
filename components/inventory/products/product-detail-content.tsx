import { Badge } from "@/components/ui/badge"
import { formatShortDate } from "@/lib/utils"
import type { getProductById } from "@/lib/actions/inventory/product-actions"

type Product = NonNullable<Awaited<ReturnType<typeof getProductById>>>

/**
 * The body of a product's detail view — Basic Information / Metal Details /
 * Default Charges / Weights / Product Details / Additional Information.
 * Shared between the standalone /inventory/products/[id] page and the
 * inline detail pane on the Products list itself (ProductDetailPanel), so
 * the two can never drift apart. Every field captured on Add Product
 * appears here, grouped the same way the create/edit form groups them.
 */
export function ProductDetailContent({ product }: { product: Product }) {
  return (
    <div className="space-y-6">
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
        {product.metalType?.isGemstone ? (
          <Field
            label="Stone Type"
            value={
              <Badge variant="secondary">
                {product.stoneOriginOption?.name ?? "Not set"}
              </Badge>
            }
          />
        ) : null}
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

      <Section title="Weights">
        <Field
          label="Gross Weight"
          value={formatWeight(product.defaultGrossWeight)}
        />
        <Field
          label="Stone Weight"
          value={formatWeight(product.defaultStoneWeight)}
        />
        <Field
          label="Net Weight"
          value={formatWeight(product.defaultNetWeight)}
        />
      </Section>

      <Section title="Product Details">
        <Field label="Design Code" value={product.designCode} />
        <Field label="HSN Code" value={product.hsnCode} />
        <Field label="Created" value={formatShortDate(product.createdAt)} />
        <Field label="Last Updated" value={formatShortDate(product.updatedAt)} />
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
    </div>
  )
}

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

/**
 * Three decimals to match the column, and a unit, because a bare number on a
 * jewellery record is ambiguous between grams and carats.
 */
function formatWeight(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  return `${Number(value).toFixed(3)} g`
}
