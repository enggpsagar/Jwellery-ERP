import { Badge } from "@/components/ui/badge"
import { ActiveBadge } from "@/components/shared/active-badge"
import { ProductStatusToggle } from "@/components/inventory/products/product-status-toggle"
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
export function ProductDetailContent({
  product,
  canEdit = false,
}: {
  product: Product
  /** Gates the Status field between a plain read-only badge and the
   * editable Active/Inactive switch (mirrors ProductRowActions' own
   * canEdit gate for Edit/Delete). */
  canEdit?: boolean
}) {
  const makingCharge = formatCharge(
    product.defaultMakingCharge,
    product.defaultMakingChargeType,
  )
  const stoneCharge = formatCharge(
    product.defaultStoneCharge,
    product.defaultStoneChargeType,
  )
  const grossWeight = formatWeight(product.defaultGrossWeight)
  const stoneWeight = formatWeight(product.defaultStoneWeight)
  const netWeight = formatWeight(product.defaultNetWeight)
  const caratWeight = formatCarat(product.defaultCaratWeight)
  const stoneRate = formatCharge(product.defaultStoneRate, "FIXED")

  const hasMetalDetails = Boolean(product.metalType?.name) || Boolean(product.defaultPurity)
  const hasCharges = Boolean(makingCharge) || Boolean(stoneCharge)
  const hasWeights = Boolean(grossWeight) || Boolean(stoneWeight) || Boolean(netWeight)
  // A piece carries stone info either as a stand-alone gemstone product
  // (stoneOriginOptionId, only meaningful when the metal itself is a
  // gemstone) or as a composite metal+stone piece (hasStoneComponent) — the
  // Weights section already shows Stone Weight either way, but this is
  // where the rest of that stone's own description lives.
  const hasStoneDetails =
    Boolean(stoneWeight) ||
    product.hasStoneComponent ||
    Boolean(product.stoneOriginOption?.name)
  const hasAdditionalInfo = Boolean(product.description) || Boolean(product.notes)

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
            canEdit ? (
              <ProductStatusToggle productId={product.id} isActive={product.isActive} />
            ) : (
              <ActiveBadge isActive={product.isActive} />
            )
          }
        />
      </Section>

      {hasMetalDetails ? (
        <Section title="Metal Details">
          <Field label="Metal Type" value={product.metalType?.name} />
          <Field
            label="Default Purity"
            value={product.defaultPurity?.replaceAll("_", " ")}
          />
        </Section>
      ) : null}

      {hasCharges ? (
        <Section title="Default Charges">
          <Field label="Making Charge" value={makingCharge} />
          {makingCharge ? (
            <Field
              label="Making Charge Type"
              value={
                product.defaultMakingChargeType === "PERCENTAGE"
                  ? "Percentage"
                  : "Fixed"
              }
            />
          ) : null}
          <Field label="Stone Charge" value={stoneCharge} />
          {stoneCharge ? (
            <Field
              label="Stone Charge Type"
              value={
                product.defaultStoneChargeType === "PERCENTAGE"
                  ? "Percentage"
                  : "Fixed"
              }
            />
          ) : null}
        </Section>
      ) : null}

      {hasWeights ? (
        <Section title="Weights">
          <Field label="Gross Weight" value={grossWeight} />
          <Field label="Stone Weight" value={stoneWeight} />
          <Field label="Net Weight" value={netWeight} />
        </Section>
      ) : null}

      {hasStoneDetails ? (
        <Section title="Stone Details">
          <Field label="Carat Weight" value={caratWeight} />
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
          {product.hasStoneComponent ? (
            <>
              <Field label="Embedded Stone" value={product.defaultStoneMetalTypeName} />
              <Field label="Embedded Stone Type" value={product.defaultStoneTypeNames} />
              <Field label="Stone Rate (per ct)" value={stoneRate} />
            </>
          ) : null}
        </Section>
      ) : null}

      <Section title="Product Details">
        <Field label="Design Code" value={product.designCode} />
        <Field label="HSN Code" value={product.hsnCode} />
        <Field label="Created" value={formatShortDate(product.createdAt)} />
        <Field label="Last Updated" value={formatShortDate(product.updatedAt)} />
      </Section>

      {hasAdditionalInfo ? (
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
      ) : null}
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
  const empty = value === undefined || value === null || value === ""
  if (empty) return null

  return (
    <div className={className}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 font-medium break-words">{value}</div>
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

function formatCarat(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  return `${Number(value).toFixed(3)} ct`
}
