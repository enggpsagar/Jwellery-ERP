"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useActionState } from "react"
import { Trash2, ChevronDown, ChevronRight, Search, Plus, MoveHorizontal } from "lucide-react"
import type { GstScheme, PurityType } from "@prisma/client"

import { createInvoice, updateInvoice, type InvoiceFormState } from "@/lib/actions/invoice-actions"
import { getCustomerAvailableCredit } from "@/lib/actions/payments-actions"
import { checkPromotionCode } from "@/lib/actions/promotion-redeem-actions"
import { computePromotion, describePromotion, type PromotionConfig, type PromotionLine } from "@/lib/promotions"
import { useToast } from "@/components/providers/toast-provider"
import { ScanToAddPanel } from "@/components/billing/scan-to-add-panel"
import { todayForDateInput } from "@/lib/date-input"
import { playScanBeep } from "@/lib/scan-beep"
import { computeGst } from "@/lib/gst"
import {
  DeliveryLocationSelect,
  type DeliveryLocationStateOption,
} from "@/components/shared/delivery-location-select"
import { computeRoundOff } from "@/lib/round-off"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { CustomerSelect } from "@/components/customers/customer-select"
import { SourcePartySelect, type SourcePartyOption } from "@/components/billing/source-party-select"
import { InvoiceOldGoldCard } from "@/components/billing/invoice-old-gold-card"
import type { PrintExchange } from "@/components/billing/print-exchange-rows"
import {
  OldGoldExchangeSection,
  oldGoldLineAmounts,
  serializeOldGoldLine,
} from "@/components/billing/old-gold-exchange-section"
import {
  splitOldGoldValue,
  type OldGoldExcessModeValue,
  type OldGoldLineDraft,
} from "@/lib/old-gold/value"
import { MakingChargeInput } from "@/components/shared/making-charge-input"
import { PercentOrFlatInput } from "@/components/shared/percent-or-flat-input"
import { RequiredMark } from "@/components/shared/required-mark"
import { LocationSelect, useShowLocationField, type LocationOption } from "@/components/shared/location-select"
import { PaidNowFields } from "@/components/shared/paid-now-fields"
import type { PaymentMethodValue } from "@/components/shared/payment-method-fields"
import { isCaratWeighedMetal, isHallmarkablePurity, resolveGramsPerCarat, resolveStockSellingRate, toPrimaryUnit, matchLegacyPurityType, resolveLegacyPurityLabel } from "@/lib/purity"
import { classifyMetalName, classifyPurityFamily } from "@/lib/business-units"
import {
  getStoreCategoryTypes,
  getStoreMetalPurities,
  type StoreCategoryRow,
  type StoreCategoryTypeRow,
  type StoreStyleRow,
  type StoreMetalRow,
  type StoreMetalOriginRow,
  type StoreMetalPurityRow,
} from "@/lib/actions/taxonomy-actions"
import type { GstRateRow } from "@/lib/actions/gst-rate-actions"
import { StoneComponentFields } from "@/components/inventory/shared/stone-component-fields"
import { StockItemSelect } from "@/components/inventory/shared/stock-item-select"
import { IncludesStoneToggle } from "@/components/ui/includes-stone-toggle"
import { StonePresenceQuestion } from "@/components/shared/stone-presence-question"
import { PieceComponentsEditor, StoneExtras } from "@/components/shared/piece-components-editor"
import { MultiPartQuestion } from "@/components/shared/multi-part-question"
import {
  newMetalRow,
  newStoneRow,
  pieceGst,
  pieceTotals,
  toComponentPayload,
  type PieceComponentDraft,
  type StoredPieceComponent,
} from "@/lib/piece-components"
import { AddMetalDialog } from "@/components/inventory/shared/add-metal-dialog"
import { AddPurityDialog } from "@/components/inventory/shared/add-purity-dialog"
import { AddCategoryDialog } from "@/components/inventory/shared/add-category-dialog"
import { AddCategoryTypeDialog } from "@/components/inventory/shared/add-category-type-dialog"
import { LinkedProductDetails } from "@/components/inventory/shared/linked-product-details"
import type { StockOptionProductDetails } from "@/lib/inventory/stock-option-details"
import { stockPieceDrafts, stoneSellingRate, type LinkedStoneDetails } from "@/lib/inventory/stock-pick-rates"

type CustomerOption = {
  id: string
  name: string
  phone: string | null
  customerCode: string | null
  state: string | null
}

type StockOption = {
  id: string
  stockCode: string
  productName: string
  productCode: string | null
  hsnCode: string | null
  metalType: { id: string; name: string } | null
  purity: string | null
  purityLabel: string | null
  grossWeight: number | null
  netWeight: number | null
  stoneWeight: number | null
  caratWeight: number | null
  stoneRate: number | null
  stoneMetalTypeName: string | null
  stoneTypeNames: string | null
  saleRate: number | null
  // The real per-Metal Purity / per-Stone-Type configured Selling Price
  // this piece's product is actually linked to — see resolveStockSellingRate
  // (lib/purity.ts). Exactly one of these two is ever non-null for a given
  // product (mutually exclusive by StoreMetal.isGemstone).
  storeMetalPurityRate: number | null
  stoneOriginRate: number | null
  makingCharge: number | null
  makingChargeType: "FIXED" | "PERCENTAGE"
  quantity: number
  /** A piece made of several metals/stones — its rows (lib/piece-components.ts). */
  components?: StoredPieceComponent[]
  /** A single stone's pieces / clarity / certificate / catalog rate. */
  linkedStone?: LinkedStoneDetails | null
} & StockOptionProductDetails

/**
 * The catalog fields a picked/scanned piece carries over from its Product
 * (see lib/inventory/stock-option-details.ts) — the stock row's own values
 * win; the Product's fill the gaps so Purity/GST Rate/Making Charge aren't
 * left blank on a piece whose stock row never recorded them.
 */
function stockCatalogFields(stock: StockOption, fallbackGstRateId: string) {
  const hasOwnMaking = stock.makingCharge != null && stock.makingCharge > 0
  return {
    purityLabel: stock.purityLabel || stock.productPurityLabel || "",
    gstRateId: stock.gstRateId || fallbackGstRateId,
    makingCharge: hasOwnMaking ? (stock.makingCharge as number) : stock.defaultMakingCharge ?? 0,
    makingChargeType: hasOwnMaking ? stock.makingChargeType : stock.defaultMakingChargeType,
  }
}

/** A piece has a stone when its stock row or its Product says so — not
 * only when a stone rate was recorded (most stones are priced at sale). */
function stockHasStone(stock: StockOption) {
  return (
    stock.stoneRate != null ||
    (stock.caratWeight ?? 0) > 0 ||
    (stock.stoneWeight ?? 0) > 0 ||
    Boolean(stock.stoneMetalTypeName) ||
    stock.productHasStone
  )
}

export type LineItem = {
  key: string
  itemName: string
  metalTypeId: string
  /** Kept in sync (via matchLegacyPurityType) from whichever real per-Metal
   * Purity is picked — see purityLabel. Submitted as-is purely so anything
   * not yet reading purityLabel still shows something. */
  purity: string
  /** The real per-Metal Purity's own label (e.g. "22K") — see
   * StoreMetalPurity in schema.prisma. Denormalized (not an FK), same
   * convention as stoneMetalTypeName below. */
  purityLabel: string
  quantity: number
  grossWeight: number
  /** Always in grams internally, regardless of grossWeightUnit — that unit
   * only picks what's displayed/typed (converted via toPrimaryUnit on the
   * way in and out) and what unit this line's weights are persisted in at
   * submit. Same convention for netWeight/dmoWeight/stoneWeightInput below. */
  grossWeightUnit: "GRAM" | "CARAT"
  netWeight: number
  netWeightUnit: "GRAM" | "CARAT"
  caratWeight: number
  rate: number
  makingCharge: number
  makingChargeType: "FIXED" | "PERCENTAGE"
  stoneCharge: number
  /** Rate per carat for this line's embedded stone/diamond component —
   * distinct from a line whose own metal IS Diamond/Stone (isCaratLine):
   * this is for a metal-primary line (e.g. Gold) that also carries a
   * stone, auto-summing stoneRate × caratWeight into Stone Charge. */
  stoneRate: number
  /** Whether this line has a stone/diamond component alongside its metal
   * — shows Carat Weight (the stone's own weight, independent of Net
   * Weight) + Stone Rate. Set automatically when linked stock carries a
   * stoneRate; otherwise a manual per-line toggle. */
  hasStoneComponent: boolean
  /** Once Stone Charge is edited directly, the stoneRate × caratWeight
   * auto-calc stops overwriting it — same escape hatch as netTouched. */
  stoneChargeTouched: boolean
  /** Once Net Stone Weight is edited directly, the Stone Carat Weight ->
   * Net Stone Weight auto-fill (see handleCaratWeightChange) stops
   * overwriting it — same escape hatch as stoneChargeTouched. */
  netStoneWeightTouched: boolean
  /** Which Stone (e.g. "Diamond") and which of its Stone Types (e.g.
   * "Natural", "Lab-Grown" — several may apply to one embedded stone)
   * this line's stone component is. Plain names, not ids — see the
   * Product.defaultStoneMetalTypeName schema comment for why. */
  stoneMetalTypeName: string
  stoneTypeNames: string[]
  dmoWeight: number
  dmoWeightUnit: "GRAM" | "CARAT"
  /** Always in grams internally — see grossWeightUnit's doc comment above. */
  stoneWeightInput: number
  stoneWeightUnit: "GRAM" | "CARAT"
  hmCharge: number
  /** Once HM Charge is edited directly, the Purity -> HM Charge auto-fill
   * (Settings' per-piece BIS hallmark rate, applied on Gold/Silver purities
   * only — see isHallmarkablePurity) stops overwriting it — same escape
   * hatch as stoneChargeTouched/netStoneWeightTouched. */
  hmChargeTouched: boolean
  schemeDiscount: number
  hsnCode: string
  inventoryStockId: string
  /** Once Net Weight is edited directly, the gross/stone/dmo auto-calc
   * stops overwriting it. */
  netTouched: boolean
  /** Which configured GstRate (Settings > GST Rates) THIS line uses — GST
   * is now picked per line, not once for the whole document, so a single
   * invoice can mix e.g. a 3% metal line with an 18% service line. Starts
   * as the document-level "default for new items" selection (see
   * emptyLineItem's own doc comment) but is independent from then on —
   * changing the document-level default never retroactively changes an
   * already-set line. Falls back to the document-level rate in lineGst()
   * below when blank/unresolved, so an empty string here is always safe. */
  gstRateId: string
  /** Whether this line has explicitly gone through the Link Stock Item
   * picker — either linked to a real stock row, or deliberately sent down
   * "Create New Line Item" to type one by hand. False only for a freshly-
   * added blank row nobody has touched yet; that's what hasInvalidStockLink
   * blocks submission on, so a line can't silently skip the picker just by
   * typing straight into Item Name. Pre-existing lines loaded via
   * initialItems (edit/replace) are grandfathered to true regardless — see
   * those pages' own comments on this field. */
  stockLinkDecided: boolean
  /** Catalog classification for a "Create New Line Item" line — the
   * Product minted for it on save (createStockForManualSaleLine) gets
   * these, and createInvoice rejects a new line without Category (and
   * Style, when the store uses it), same as Add Product does. Ignored for
   * a stock-linked line: its product already has them. */
  categoryId: string
  categoryTypeId: string
  targetStyleId: string
  /** Who a "Create New Line Item" piece came in from — saved onto the
   * stock row minted for it (InventoryStock.vendorId) so the metal's
   * arrival is traceable later, the same way a Purchase's stock is.
   * Required on a new line; ignored for a stock-linked line. */
  sourcePartyId: string
  /** A piece made of several metals and stones (Gold + Silver + Diamond…):
   * its value, weights and GST come from `components`, one row per metal /
   * stone, each with its own rate and GST rate (lib/piece-components.ts).
   * The line's own metal/purity/weights are kept in sync from them. */
  multiPart: boolean
  components: PieceComponentDraft[]
}

function deriveNetWeight(grossWeight: number, stoneWeight: number, dmoWeight: number) {
  if (!grossWeight) return null
  const net = grossWeight - stoneWeight - dmoWeight
  return net >= 0 ? Number(net.toFixed(3)) : null
}

// `key` defaults to a fresh UUID for every "Add Item" click (client-only,
// safe to randomize), but the very first row is seeded once from
// useState's initializer, which runs during SSR *and* again on the
// client's first render — two different crypto.randomUUID() values for
// the same row caused a hydration mismatch on every line-item form. The
// initial call passes a fixed key instead so server and client agree.
function emptyLineItem(defaultGstRateId?: string, key: string = crypto.randomUUID()): LineItem {
  return {
    key,
    itemName: "",
    metalTypeId: "",
    purity: "",
    purityLabel: "",
    quantity: 1,
    grossWeight: 0,
    grossWeightUnit: "GRAM",
    netWeight: 0,
    netWeightUnit: "GRAM",
    caratWeight: 0,
    rate: 0,
    makingCharge: 0,
    makingChargeType: "FIXED",
    stoneCharge: 0,
    stoneRate: 0,
    hasStoneComponent: false,
    stoneChargeTouched: false,
    netStoneWeightTouched: false,
    stoneMetalTypeName: "",
    stoneTypeNames: [],
    dmoWeight: 0,
    dmoWeightUnit: "GRAM",
    stoneWeightInput: 0,
    stoneWeightUnit: "GRAM",
    hmCharge: 0,
    hmChargeTouched: false,
    schemeDiscount: 0,
    hsnCode: "",
    inventoryStockId: "",
    netTouched: false,
    gstRateId: defaultGstRateId ?? "",
    stockLinkDecided: false,
    categoryId: "",
    categoryTypeId: "",
    targetStyleId: "",
    sourcePartyId: "",
    multiPart: false,
    components: [],
  }
}

/**
 * Where an in-progress invoice is parked while the user is away creating a
 * new party via CustomerSelect's "+" (onBeforeAddNew below) — same purpose
 * and shape as DraftOrderForm's own DRAFT_KEY
 * (components/orders/draft-order-form.tsx). sessionStorage (not
 * localStorage) so it dies with the tab and can never resurrect a stale
 * draft days later. Only ever written/read on the create flow (CustomerSelect
 * is not rendered at all once editInvoiceId is set — see the Party field
 * below), so nothing here needs to account for full-edit-only fields like
 * legacyPaidAmount.
 */
const DRAFT_KEY = "invoice-form-draft"

type InvoiceFormDraft = {
  customerId: string
  items: LineItem[]
  expandedKeys: string[]
  locationId: string
  deliveryState: string
  deliveryStateCode: string
  discount: number
  roundOffOverride: number | null
  paymentRows: PaymentMethodValue[]
  invoiceDate: string
  dueDate: string
  notes: string
}

const initialState: InvoiceFormState = { success: false, message: "" }

type InvoiceFormProps = {
  customers: CustomerOption[]
  stockItems: StockOption[]
  locations: LocationOption[]
  /** Stones (isGemstone StoreMetal rows) and their Stone Types
   * (StoreMetalOrigin rows), for the "Includes a Stone" picker on each
   * line. Lifted into local state below so an inline "Add Stone"/"Add
   * Stone Type" can extend the list without navigating away or losing
   * whatever else has already been entered on this document. */
  metals: StoreMetalRow[]
  origins: StoreMetalOriginRow[]
  /** Category / Style for a "Create New Line Item" line — see LineItem's
   * categoryId. Types are fetched per category on demand. */
  categories: StoreCategoryRow[]
  styles: StoreStyleRow[]
  /** "Purchased From" options for a "Create New Line Item" line —
   * getSupplierOptions(): Suppliers only when the Supplier module is on
   * (supplierModuleEnabled), every party when it's off. */
  suppliers?: SourcePartyOption[]
  supplierModuleEnabled?: boolean
  /** BusinessSettings.styleFieldEnabled — Style is only asked for (and
   * only required) when the store uses it, same as Add Product. */
  styleFieldEnabled?: boolean
  /** Grams-per-carat per purity (Settings > Purity & Carat > Carat
   * Conversion Rules), resolved via resolveGramsPerCarat() wherever a
   * Carat Weight is converted to/from grams on this form. */
  caratConversionRates: Record<PurityType, number>
  /** The store's configured GST rates (Settings > GST Rates) — picked from
   * a dropdown per invoice, split into SGST+CGST (intra-state) or IGST
   * (inter-state) via computeGst() — see lib/gst.ts. Includes inactive rows
   * too (filtered to active-or-currently-selected in this component) so an
   * invoice already using a since-deactivated rate can still show it. */
  gstRates: GstRateRow[]
  /** The rate this invoice already used (edit/replace) — preselects it even
   * if it's no longer the store's default, or has since been deactivated. */
  initialGstRateId?: string
  /** Legacy last-resort fallback (BusinessSettings.defaultGstRate) — only
   * used when the store somehow has zero GstRate rows at all, which
   * shouldn't happen given every store is seeded with one, but this avoids
   * a hard crash if it ever does. */
  defaultGstRate?: number
  /** Store's configured per-piece BIS hallmark charge (Settings > Hallmark
   * Charge) — auto-filled into a line's HM Charge the moment its Purity is
   * set to a Gold/Silver value (isHallmarkablePurity), while hmChargeTouched
   * is false. See BusinessSettings.hallmarkChargePerPiece's own doc comment
   * for why this is a store-verified figure, not a guaranteed-current rate. */
  hallmarkChargePerPiece?: number
  /** Drives whether GST can be charged at all (never, for Composition) and
   * how it's split — see computeGst()'s own doc comment in lib/gst.ts. */
  gstScheme: GstScheme
  /** The store's own state — Delivery Location defaults to this, and
   * whichever state ends up selected there (not the customer's own
   * registered state) is what computeGst() compares it against to tell an
   * inter-state sale (IGST) from an intra-state one (SGST+CGST). */
  storeState?: string | null
  /** The store's own GST state code (BusinessSettings.stateCode) — Delivery
   * Location's own code defaults from this. */
  storeStateCode?: string | null
  /** Every state + its GST state code, for the Delivery Location picker —
   * see components/shared/delivery-location-select.tsx. */
  states: DeliveryLocationStateOption[]
  /** Prefill for editing/replacing an existing invoice — defaults to
   * storeState/storeStateCode when unset (a fresh invoice). */
  initialDeliveryState?: string | null
  initialDeliveryStateCode?: string | null
  /** BusinessSettings.showDueDate — hides the Due Date field entirely when
   * off. Defaults true so an existing caller not yet passing this keeps
   * showing it, matching today's behavior. */
  showDueDate?: boolean
  /** Prefill from a cancelled invoice being replaced — see
   * app/(dashboard)/billing/[id]/replace/page.tsx. All optional; a fresh
   * "New Invoice" passes none of these. */
  initialCustomerId?: string
  initialLocationId?: string
  initialItems?: LineItem[]
  replacesId?: string
  replacesInvoiceNumber?: string
  /** Full line-item edit of an existing DRAFT/PARTIAL invoice — see
   * app/(dashboard)/billing/[id]/edit/page.tsx. When set, the form binds
   * to updateInvoice instead of createInvoice; everything else about the
   * form (all fields, stock picker, weight/purity inputs) is identical,
   * which is the whole point — full editing needs no extra fields of its
   * own, just a different action to submit to. */
  editInvoiceId?: string
  /** Starting text for the Notes field — the invoice's own saved notes
   * when editing/replacing, or the store's Default Invoice Notes (Settings)
   * for a fresh invoice. Uncontrolled (defaultValue), so typing over it
   * doesn't fight the form. */
  defaultNotes?: string
  /** Old Gold Exchange: the store's per-purity fineness table (legacy enum
   * fallback when a metal has no purity rows) and today's fine rates. */
  enumFineness?: Record<string, number>
  fineRates?: { gold: number | null; silver: number | null }
  /** Edit Invoice: the exchange already recorded on this invoice (shown
   * read-only — never re-edited), and what's been paid so far (a new
   * exchange added while editing goes against what's still unpaid). */
  existingExchange?: PrintExchange | null
  alreadyPaid?: number
}

export function InvoiceForm({
  customers,
  stockItems,
  locations,
  metals: initialMetals,
  origins: initialOrigins,
  categories: initialCategories,
  styles,
  suppliers = [],
  supplierModuleEnabled = false,
  styleFieldEnabled = true,
  caratConversionRates,
  gstRates,
  initialGstRateId,
  defaultGstRate = 0,
  hallmarkChargePerPiece = 0,
  gstScheme,
  storeState,
  storeStateCode,
  states,
  initialDeliveryState,
  initialDeliveryStateCode,
  showDueDate = true,
  initialCustomerId,
  initialLocationId,
  initialItems,
  replacesId,
  replacesInvoiceNumber,
  editInvoiceId,
  defaultNotes,
  enumFineness = {},
  fineRates = { gold: null, silver: null },
  existingExchange = null,
  alreadyPaid = 0,
}: InvoiceFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const toast = useToast()
  const formRef = useRef<HTMLFormElement>(null)
  const showLocationField = useShowLocationField(locations.length)
  const [metals, setMetals] = useState(initialMetals)
  const [origins, setOrigins] = useState(initialOrigins)
  // Which line item's own "Add Metal Type" / "Add Purity" quick-create is
  // open, if any — a per-line inline dialog (see AddMetalDialog/
  // AddPurityDialog's own doc comments), not a page navigation, so nothing
  // else already typed on this form is ever at risk.
  const [addMetalForKey, setAddMetalForKey] = useState<string | null>(null)
  const [addPurityForKey, setAddPurityForKey] = useState<string | null>(null)
  const [categories, setCategories] = useState(initialCategories)
  // Same rule as validateManualSaleLines: Style is only asked for when the
  // store uses it AND has at least one to pick.
  const showStyleField = styleFieldEnabled && styles.some((style) => style.isActive)
  const [addCategoryForKey, setAddCategoryForKey] = useState<string | null>(null)
  const [addTypeForKey, setAddTypeForKey] = useState<string | null>(null)

  const [customerId, setCustomerId] = useState(initialCustomerId ?? "")
  // How much of the selected customer's own existing store credit (a prior
  // Credit Note, an overpayment) they have available right now, and how
  // much of it is being drawn down against this invoice — create-flow
  // only, mirrors a payment-method row's effect on paidAmount but sourced
  // from their balance instead of new cash. Re-fetched fresh on every
  // customer change so it can't go stale across a long-open tab; reset to
  // 0 alongside it so switching customers never silently carries over an
  // amount that belonged to the previous one.
  // Offer / gift voucher applied to this new invoice (code checked by the
  // server: checkPromotionCode). Cleared when the party changes, since
  // vouchers and per-customer limits depend on who's buying.
  const [appliedPromotion, setAppliedPromotion] = useState<{
    promotion: PromotionConfig
    voucherId: string | null
    code: string
  } | null>(null)
  const [promoCodeInput, setPromoCodeInput] = useState("")
  const [promoChecking, setPromoChecking] = useState(false)
  const [promoError, setPromoError] = useState("")
  useEffect(() => {
    setAppliedPromotion(null)
    setPromoError("")
  }, [customerId])
  const applyPromotionCode = async () => {
    if (!promoCodeInput.trim()) return
    setPromoChecking(true)
    setPromoError("")
    try {
      const result = await checkPromotionCode(promoCodeInput, customerId || null)
      if (result.ok) {
        setAppliedPromotion({ promotion: result.promotion, voucherId: result.voucherId, code: result.code })
        setPromoCodeInput(result.code)
      } else {
        setPromoError(result.reason)
      }
    } catch {
      setPromoError("Couldn't check that code — try again.")
    } finally {
      setPromoChecking(false)
    }
  }
  const [customerCredit, setCustomerCredit] = useState(0)
  const [creditApplied, setCreditApplied] = useState(0)
  useEffect(() => {
    if (editInvoiceId || !customerId) {
      setCustomerCredit(0)
      setCreditApplied(0)
      return
    }
    setCreditApplied(0)
    let cancelled = false
    getCustomerAvailableCredit(customerId)
      .then((credit) => {
        if (!cancelled) setCustomerCredit(credit)
      })
      .catch((err) => console.error("Failed to load customer credit:", err))
    return () => {
      cancelled = true
    }
  }, [customerId, editInvoiceId])
  const [locationId, setLocationId] = useState(initialLocationId ?? "")
  // CustomerSelect/LocationSelect both seed their own selection from
  // `defaultValue` into internal state, so changing that prop alone will
  // not move them once a restored value needs to show — bumping this key
  // forces a remount that re-seeds from the new defaultValue. Same pattern
  // as DraftOrderForm's own customerSelectKey/locationSelectKey.
  const [customerSelectKey, setCustomerSelectKey] = useState(0)
  const [locationSelectKey, setLocationSelectKey] = useState(0)
  // Shared by both the `items` initial state below and `gstRateId` itself
  // (declared further down) — a plain function, not a hook, so it can be
  // called from either initializer regardless of declaration order. A
  // Composition-scheme store can never charge GST — see GstScheme's doc
  // comment in schema.prisma — so no rate is selected at all regardless of
  // the store's configured GST Rates or default.
  const resolveDefaultGstRateId = () => {
    if (gstScheme === "COMPOSITION") return ""
    if (initialGstRateId && gstRates.some((r) => r.id === initialGstRateId)) {
      return initialGstRateId
    }
    return (
      gstRates.find((r) => r.isDefault && r.isActive)?.id ??
      gstRates.find((r) => r.isActive)?.id ??
      ""
    )
  }
  const [items, setItems] = useState<LineItem[]>(
    initialItems && initialItems.length
      ? initialItems
      : [emptyLineItem(resolveDefaultGstRateId(), "initial")],
  )
  // Which lines' Details region (every field beyond the compact row) is
  // open. Heuristic — a judgment call, not a hard requirement: a line
  // present when the form first loaded (edit/replace's initialItems) starts
  // expanded, since it's real data more likely being reviewed/corrected than
  // typed fresh; a freshly-added blank row ("Add Item") starts collapsed,
  // matching the dense, compact-by-default spreadsheet look. A line that
  // becomes stock-linked afterwards (StockItemSelect's dropdown, or a
  // ScanToAddPanel scan) is also expanded at that point, in applyStockToItem
  // / addScannedStock below, for the same reason.
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    () =>
      new Set(
        (initialItems && initialItems.length ? initialItems : []).map((item) => item.key),
      ),
  )
  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const [discount, setDiscount] = useState(0)
  // null = auto-calculated (the standard "round to nearest rupee" figure);
  // a number = the merchant typed their own Round Off directly, same
  // "typed once, used as-is" convention as Discount/Making Charge — see
  // computeRoundOff's own doc comment for how this reaches the server.
  const [roundOffOverride, setRoundOffOverride] = useState<number | null>(null)
  // No longer a user-facing control (each line picks its own GST rate in
  // its own Details region) — this is just what a freshly-added line
  // starts on, resolved once from the store's own default/active GstRate
  // and never changed afterward, so it doesn't need a setter.
  const [gstRateId] = useState<string>(resolveDefaultGstRateId)
  const selectedGstRate = gstRates.find((r) => r.id === gstRateId)
  // The plain percent, still fed into computeGst() exactly as before — only
  // where the number comes from changed, not the tax math itself. Falls
  // back to the store's legacy BusinessSettings.defaultGstRate only if
  // somehow no GstRate could be resolved (e.g. a store with zero rows).
  const gstRate =
    gstScheme === "COMPOSITION" ? 0 : (selectedGstRate?.ratePercent ?? defaultGstRate)
  // Full line-item edit (editInvoiceId set) still shows a bare "Paid Now"
  // number for the same reason it always has — updateInvoice never reads
  // paidAmount off the form at all (it recomputes from the invoice's own
  // already-recorded paidAmount instead, see its own doc comment), so this
  // field is already inert there and left untouched. A fresh invoice
  // (createInvoice) uses the payment-method rows below instead — paidAmount
  // is always derived from them, never tracked as separate state, so it
  // can't go stale relative to what's actually been entered.
  const [legacyPaidAmount, setLegacyPaidAmount] = useState(0)
  const [paymentRows, setPaymentRows] = useState<PaymentMethodValue[]>([])
  const paidBeforeOldGold = editInvoiceId
    ? legacyPaidAmount
    : paymentRows.reduce((sum, row) => sum + (row.amount || 0), 0) + creditApplied

  // Old Gold Exchange (create flow only) — see OldGoldExchangeSection.
  const [oldGoldLines, setOldGoldLines] = useState<OldGoldLineDraft[]>([])
  const [oldGoldExcessMode, setOldGoldExcessMode] = useState<OldGoldExcessModeValue>("STORE_CREDIT")
  const [oldGoldPayoutMethod, setOldGoldPayoutMethod] = useState("")
  const [oldGoldPayoutReference, setOldGoldPayoutReference] = useState("")

  // Delivery Location — where the goods are actually being shipped, which
  // decides CGST+SGST vs IGST (see computeGst() below), independent of
  // the Party's own registered address. Left blank until this invoice
  // already had one (editing/replacing) or the user explicitly picks one —
  // a blank delivery state is treated as intra-state by computeGst/splitGst
  // exactly like a matching state would be, so there's no need to default
  // it to the store's own state just to make the math work.
  const [deliveryState, setDeliveryState] = useState(initialDeliveryState ?? "")
  const [deliveryStateCode, setDeliveryStateCode] = useState(initialDeliveryStateCode ?? "")
  // Keeps the picker open once the user has explicitly opened it, even if
  // they then clear the state back to blank — reappearing as a plain "Add"
  // button mid-edit would be a jarring rug-pull.
  const [showDeliveryPicker, setShowDeliveryPicker] = useState(Boolean(initialDeliveryState))

  const [state, formAction, pending] = useActionState(
    editInvoiceId ? updateInvoice.bind(null, editInvoiceId) : createInvoice,
    initialState,
  )

  useEffect(() => {
    if (state.success && state.invoiceId) {
      toast.success(state.message || (editInvoiceId ? "Invoice updated" : "Invoice created"))
      router.push(`/billing/${state.invoiceId}`)
    } else if (!state.success && state.message) {
      toast.error(state.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  /**
   * Parks the whole in-progress invoice before navigating off to create a
   * new party via CustomerSelect's "+" (wired as its onBeforeAddNew below).
   * Without this, every line item, GST/location selection, notes and
   * everything else already entered was silently dropped on return — same
   * bug/fix as DraftOrderForm's own saveDraft.
   *
   * Invoice Date, Due Date and Notes are uncontrolled inputs, so they are
   * read off the form element rather than from state.
   */
  const saveDraft = () => {
    const formData = formRef.current ? new FormData(formRef.current) : null

    const draft: InvoiceFormDraft = {
      customerId,
      items,
      expandedKeys: Array.from(expandedKeys),
      locationId,
      deliveryState,
      deliveryStateCode,
      discount,
      roundOffOverride,
      paymentRows,
      invoiceDate: formData ? String(formData.get("invoiceDate") ?? "") : "",
      dueDate: formData ? String(formData.get("dueDate") ?? "") : "",
      notes: formData ? String(formData.get("notes") ?? "") : "",
    }

    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {
      // A full or blocked sessionStorage shouldn't stop the user getting to
      // the create page — they just lose the draft, same as before.
    }
  }

  const updateItem = (key: string, patch: Partial<LineItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    )
  }


  const handleHmChargeChange = (item: LineItem, value: string) => {
    updateItem(item.key, { hmCharge: Number(value) || 0, hmChargeTouched: true })
  }

  // How many units of a stock row are still free to add, given what other
  // lines in THIS cart already claim — the same DB quantity can't be
  // billed twice across two lines just because each line's own dropdown
  // looks unclaimed. Excludes `excludeKey` so an item can see its own
  // current line's claim as available to itself while editing.
  const availableForStock = (stockId: string, excludeKey: string) => {
    const stock = stockItems.find((s) => s.id === stockId)
    if (!stock) return 0
    const claimedByOtherLines = items
      .filter((item) => item.key !== excludeKey && item.inventoryStockId === stockId)
      .reduce((sum, item) => sum + (item.quantity || 0), 0)
    return Math.max(0, stock.quantity - claimedByOtherLines)
  }

  /**
   * Everything a picked or scanned stock piece puts on its line — one
   * function for both paths so a scanned piece opens exactly like a picked
   * one (the scan path used to skip a multi-part piece's rows entirely).
   *
   * A piece of several metals/stones (its own rows, else its Product's —
   * lib/inventory/stock-piece-rows.ts) opens multi-part: every metal and
   * every stone on its own row, physical facts locked, priced at today's
   * rates (lib/inventory/stock-pick-rates.ts). A single-stone piece prices
   * its stone the same way (the piece's / Product's stone rate, else the
   * Stone Type's Selling Price, else the stone's), so Stone Charge fills in.
   */
  const linkedStockFields = (stock: StockOption): Partial<LineItem> => {
    // Already stored in the metal's own configured primary unit — this just
    // picks which unit the toggle starts on, not a value conversion.
    const linkedUnit = metalById.get(stock.metalType?.id ?? "")?.primaryUnit ?? "GRAM"
    const stoneRate = stoneSellingRate(
      {
        name: stock.stoneMetalTypeName,
        types: stock.stoneTypeNames,
        ownRate: stock.stoneRate ?? stock.linkedStone?.catalogRate,
      },
      metals,
      origins,
    )
    const caratWeight = stock.caratWeight ?? 0
    const base: Partial<LineItem> = {
      stockLinkDecided: true,
      itemName: stock.productName,
      metalTypeId: stock.metalType?.id ?? "",
      purity: stock.purity ?? "",
      grossWeight: stock.grossWeight ?? 0,
      grossWeightUnit: linkedUnit,
      netWeight: stock.netWeight ?? 0,
      netWeightUnit: linkedUnit,
      dmoWeightUnit: linkedUnit,
      stoneWeightInput: stock.stoneWeight ?? 0,
      stoneWeightUnit: linkedUnit,
      // A specific piece's own recorded sale rate wins when it has one;
      // otherwise the store's own configured per-Purity/per-Stone-Type
      // Selling Price, then the metal's, then today's fine rate — see
      // stockSellingRate. Still fully editable.
      rate: stockSellingRate(stock),
      hsnCode: stock.hsnCode ?? "",
      caratWeight,
      stoneRate,
      hasStoneComponent: stockHasStone(stock),
      stoneCharge: stoneRate > 0 && caratWeight > 0 ? Number((stoneRate * caratWeight).toFixed(2)) : 0,
      stoneChargeTouched: false,
      // Only lock the auto-fill when the linked stock row actually has a
      // recorded stone weight worth protecting — a fresh stock item with no
      // stoneWeight set (0/null) has nothing authoritative to preserve, and
      // locking it anyway permanently blocked Net Stone Weight from ever
      // auto-filling from Stone Carat Weight on that line.
      netStoneWeightTouched: stock.stoneWeight != null && Number(stock.stoneWeight) > 0,
      stoneMetalTypeName: stock.stoneMetalTypeName ?? "",
      stoneTypeNames: stock.stoneTypeNames
        ? stock.stoneTypeNames.split(",").map((name) => name.trim()).filter(Boolean)
        : [],
      // InventoryStock carries no hmCharge of its own — left untouched so
      // the Purity-driven auto-fill populates it.
      hmCharge: isHallmarkablePurity(stock.purity) ? hallmarkChargePerPiece : 0,
      hmChargeTouched: false,
      // The linked stock row's own net weight is authoritative — the
      // gross/stone/dmo calc must not silently recompute over it.
      netTouched: true,
      // Purity, GST Rate (the Product's Metal row) and Making Charge — the
      // stock row's own value first, then the Product's, then (GST only)
      // the document's default. See stockCatalogFields.
      ...stockCatalogFields(stock, gstRateId),
      multiPart: false,
      components: [],
    }
    if (!stock.components?.length) return base

    const rows = stockPieceDrafts(stock.components, { metals, origins, fineRates })
    const firstMetal = rows.find((row) => row.kind === "METAL")
    const totals = pieceTotals(rows, { valuation: "net" })
    return {
      ...base,
      multiPart: true,
      components: rows,
      // The line's own fields summarise the rows (first metal, all metals'
      // net) — same as setComponents on a hand-built multi-part line.
      metalTypeId: firstMetal?.kind === "METAL" ? firstMetal.metalTypeId : base.metalTypeId,
      purity: firstMetal?.kind === "METAL" ? firstMetal.purity : base.purity,
      purityLabel: firstMetal?.kind === "METAL" ? firstMetal.purityLabel : base.purityLabel,
      netWeight: totals.metalNet,
      grossWeight: stock.grossWeight ?? (totals.metalGross + totals.stoneGrams || totals.metalNet),
      // The stones live on their rows, not on the line's single stone.
      hasStoneComponent: false,
      stoneCharge: 0,
      stoneRate: 0,
      caratWeight: 0,
      stoneWeightInput: 0,
      stoneMetalTypeName: "",
      stoneTypeNames: [],
    }
  }

  const applyStockToItem = (key: string, stockId: string) => {
    const stock = stockItems.find((s) => s.id === stockId)
    if (!stock) {
      updateItem(key, { inventoryStockId: "" })
      return
    }

    const available = availableForStock(stockId, key)
    if (stock.metalType?.id) ensureMetalPurities(stock.metalType.id)

    updateItem(key, {
      inventoryStockId: stockId,
      ...linkedStockFields(stock),
      // Re-linking to a different stock item resets quantity to a sane
      // default for it (1, or 0 if it's already fully claimed by other
      // lines) rather than carrying over a quantity that made sense for
      // the previous stock item.
      quantity: available > 0 ? 1 : 0,
    })
    for (const component of stock.components ?? []) {
      if (component.metalTypeId) ensureMetalPurities(component.metalTypeId)
    }
    // Real data just landed on this line via the stock picker — start it
    // expanded rather than making the user hunt for the chevron to see what
    // got filled in. See expandedKeys' own doc comment above.
    setExpandedKeys((prev) => new Set(prev).add(key))
  }

  /**
   * A tag scanned on the phone becomes a line here.
   *
   * The first line starts blank, so the first scan fills it rather than
   * leaving an empty row above the item that was just scanned. After that
   * each scan appends, which is what makes scanning several pieces work.
   *
   * Scanning the same stock item again bumps that line's quantity instead
   * of adding a second, identical line — one scan = one physical piece, so
   * this is what actually enforces the available-quantity ceiling: capped
   * at `availableForStock`, checked against the DB quantity minus whatever
   * other lines in this cart already claim, the same guard the manual
   * dropdown/quantity field uses.
   */
  const addScannedStock = useCallback(
    (stockId: string) => {
      const stock = stockItems.find((option) => option.id === stockId)

      if (!stock) {
        // Sold or moved since the page loaded — the stock list here is a
        // snapshot. Say so rather than adding a line with nothing in it.
        toast.error("That item is no longer available to sell.")
        return
      }

      // Set inside the updater (where `prev` is always the latest state,
      // not a stale closure) but only acted on — toasts, etc. — after
      // setItems returns, since an updater function isn't a safe place for
      // side effects (React may invoke it more than once).
      let rejected = false
      // Key of the line a scan just filled/bumped, captured inside the
      // updater below so it can be expanded afterwards — see
      // expandedKeys' own doc comment above.
      let touchedKey: string | null = null

      setItems((prev) => {
        const existingIndex = prev.findIndex((item) => item.inventoryStockId === stock.id)

        if (existingIndex !== -1) {
          const existing = prev[existingIndex]
          const claimedByOtherLines = prev.reduce(
            (sum, item, index) =>
              index === existingIndex || item.inventoryStockId !== stock.id
                ? sum
                : sum + (item.quantity || 0),
            0,
          )
          const available = Math.max(0, stock.quantity - claimedByOtherLines)

          if (existing.quantity >= available) {
            rejected = true
            return prev
          }

          const next = [...prev]
          next[existingIndex] = { ...existing, quantity: existing.quantity + 1 }
          touchedKey = existing.key
          return next
        }

        const claimedByOtherLines = prev.reduce(
          (sum, item) => (item.inventoryStockId === stock.id ? sum + (item.quantity || 0) : sum),
          0,
        )
        if (claimedByOtherLines >= stock.quantity) {
          rejected = true
          return prev
        }

        const scanned: LineItem = {
          ...emptyLineItem(gstRateId),
          inventoryStockId: stock.id,
          // Same fields as picking it from the dropdown — see linkedStockFields.
          ...linkedStockFields(stock),
        }

        touchedKey = scanned.key

        const blank = prev.findIndex((item) => !item.inventoryStockId && !item.itemName)
        if (blank === -1) return [...prev, scanned]

        const next = [...prev]
        next[blank] = scanned
        return next
      })

      if (rejected) {
        toast.error(`Only ${stock.quantity} of ${stock.productName} in stock — all of it is already on this bill.`)
        return
      }

      for (const component of stock.components ?? []) {
        if (component.metalTypeId) ensureMetalPurities(component.metalTypeId)
      }

      if (touchedKey) {
        const key = touchedKey
        setExpandedKeys((prev) => new Set(prev).add(key))
      }

      setConfirmingClear(false)
      toast.success(`Added ${stock.productName}`)
      playScanBeep()
    },
    // gstRateId included so a freshly-scanned line always starts on the
    // document's CURRENT default rather than whatever was default when
    // this callback was first created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stockItems, gstRateId, metals, origins, fineRates],
  )

  // Rows that actually hold something. The form always keeps one blank line
  // to type into, and offering to "remove all" when that is all there is
  // would be offering to do nothing.
  const filledCount = items.filter(
    (item) => item.inventoryStockId || item.itemName.trim(),
  ).length

  const [confirmingClear, setConfirmingClear] = useState(false)

  const clearAllItems = () => {
    setItems([emptyLineItem(gstRateId)])
    setConfirmingClear(false)
  }

  const removeItem = (key: string) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((item) => item.key !== key) : prev))
  }

  // metalTypeId on a line only ever comes from the linked stock item, so this
  // is the same metal-name signal product-form.tsx's classifyPurityFamily
  // uses, just resolved from the `stockItems` list this form already has.
  const metalNameByTypeId = useMemo(() => {
    const map: Record<string, string> = {}
    for (const stock of stockItems) {
      if (stock.metalType) map[stock.metalType.id] = stock.metalType.name
    }
    return map
  }, [stockItems])

  // The line's own metal's configured Primary Unit (Settings > Taxonomy) —
  // what Gross/Net/Dmo/Stone Weight are actually persisted in at submit,
  // regardless of what unit is currently toggled for display/entry.
  const metalById = useMemo(() => new Map(metals.map((m) => [m.id, m])), [metals])

  // A picked piece's Rate / g: its own sale rate, else the configured
  // per-Purity / per-Stone-Type / per-Metal Selling Price (see
  // resolveStockSellingRate), else today's fine rate (the Metal Rates board,
  // 24K gold / silver) scaled by the purity's fineness — so 18K at 75% of
  // today's 24K rate instead of a blank field. Still editable.
  const stockSellingRate = (stock: StockOption) => {
    const metal = metalById.get(stock.metalType?.id ?? "")
    const configured = resolveStockSellingRate(stock, metal?.sellingPrice)
    if (configured > 0 || stock.purityFineness == null) return configured
    const family = classifyMetalName(metal?.name ?? stock.metalType?.name)
    const fineRate = family === "GOLD" ? fineRates.gold : family === "SILVER" ? fineRates.silver : null
    return fineRate ? Number(((fineRate * stock.purityFineness) / 100).toFixed(2)) : configured
  }

  // Real per-Metal Purity options (Settings > Taxonomy > Purities),
  // replacing the old global PURITY_SELECT_OPTIONS enum list — cached per
  // metalTypeId since several lines can each have their own metal.
  const [metalPuritiesCache, setMetalPuritiesCache] = useState<Record<string, StoreMetalPurityRow[]>>({})

  const ensureMetalPurities = useCallback((metalTypeId: string) => {
    if (!metalTypeId || metalPuritiesCache[metalTypeId]) return
    getStoreMetalPurities(metalTypeId)
      .then((data) => setMetalPuritiesCache((prev) => ({ ...prev, [metalTypeId]: data })))
      .catch((err) => console.error("Failed to load purities:", err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metalPuritiesCache])

  useEffect(() => {
    const uniqueMetalTypeIds = Array.from(new Set(items.map((item) => item.metalTypeId).filter(Boolean)))
    for (const id of uniqueMetalTypeIds) ensureMetalPurities(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Category Types for a new line's Category picker — cached per category,
  // same shape as metalPuritiesCache above.
  const [categoryTypesCache, setCategoryTypesCache] = useState<Record<string, StoreCategoryTypeRow[]>>({})

  const ensureCategoryTypes = useCallback((categoryId: string) => {
    if (!categoryId || categoryTypesCache[categoryId]) return
    getStoreCategoryTypes(categoryId)
      .then((data) => setCategoryTypesCache((prev) => ({ ...prev, [categoryId]: data })))
      .catch((err) => console.error("Failed to load category types:", err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryTypesCache])

  // A category tagged to specific metals (Settings > Taxonomy) only applies
  // to those; an untagged one applies to every metal — same rule as
  // getStoreCategoriesForMetal, which Add Product's picker uses.
  const categoriesForMetal = (metalTypeId: string, selectedId: string) =>
    categories.filter(
      (category) =>
        category.id === selectedId ||
        (category.isActive &&
          (category.metalTagIds.length === 0 || (metalTypeId !== "" && category.metalTagIds.includes(metalTypeId)))),
    )

  // What a "Create New Line Item" line still lacks before it can become a
  // real Product — mirrors validateManualSaleLines on the server (which is
  // the real guarantee), listed per line so the Details region can flag it.
  const missingProductFields = (item: LineItem) => {
    if (!item.stockLinkDecided || item.inventoryStockId) return []
    const missing: string[] = []
    if (!item.itemName.trim()) missing.push("Item name")
    if (!item.metalTypeId) missing.push("Metal Type")
    if (!item.categoryId && !metalById.get(item.metalTypeId)?.isGemstone) missing.push("Category")
    if (showStyleField && !item.targetStyleId) missing.push("Style")
    if (!(item.grossWeight > 0)) missing.push("Gross Weight")
    if (!(item.netWeight > 0)) missing.push("Net Weight")
    if (!item.sourcePartyId) missing.push("Purchased From")
    return missing
  }

  // A stock item saved before per-metal Purities existed carries only the
  // legacy `purity` enum, with `purityLabel` blank — once that metal's real
  // Purity options load, this backfills the label so the Purity dropdown
  // shows the right selection instead of "None" for that line. Only touches
  // items still missing a label, so it never overwrites a real choice.
  useEffect(() => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.purityLabel || !item.purity || !item.metalTypeId) return item
        const match = resolveLegacyPurityLabel(item.purity, metalPuritiesCache[item.metalTypeId] ?? [])
        return match ? { ...item, purityLabel: match.label } : item
      }),
    )
  }, [metalPuritiesCache])

  // Restore-on-return. Runs once: reads any parked draft (see saveDraft
  // above), then selects the party that was just created. Deliberately not
  // dependent on searchParams — re-running after the URL is cleaned would
  // wipe edits made since.
  const restoredRef = useRef(false)

  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true

    const newCustomerId = searchParams.get("newCustomerId")

    let raw: string | null = null
    try {
      raw = sessionStorage.getItem(DRAFT_KEY)
      if (raw) sessionStorage.removeItem(DRAFT_KEY)
    } catch {
      raw = null
    }

    let draft: InvoiceFormDraft | null = null
    if (raw) {
      try {
        draft = JSON.parse(raw) as InvoiceFormDraft
      } catch {
        draft = null
      }
    }

    if (draft) {
      setCustomerId(newCustomerId || draft.customerId || "")
      if (draft.items && draft.items.length) setItems(draft.items)
      setExpandedKeys(new Set(draft.expandedKeys ?? []))
      setLocationId(draft.locationId ?? "")
      setDeliveryState(draft.deliveryState ?? "")
      setDeliveryStateCode(draft.deliveryStateCode ?? "")
      if (draft.deliveryState) setShowDeliveryPicker(true)
      setDiscount(draft.discount ?? 0)
      setRoundOffOverride(draft.roundOffOverride ?? null)
      setPaymentRows(draft.paymentRows ?? [])

      // The Purity dropdown for a restored line only has options once its
      // metal's purities are loaded — the mount effect just above already
      // ran (empty-handed, against the form's original blank row) before
      // this restore replaced `items`.
      for (const item of draft.items ?? []) {
        if (item.metalTypeId) ensureMetalPurities(item.metalTypeId)
        if (item.categoryId) ensureCategoryTypes(item.categoryId)
      }

      if (formRef.current) {
        const invoiceDateInput = formRef.current.elements.namedItem(
          "invoiceDate",
        ) as HTMLInputElement | null
        if (invoiceDateInput && draft.invoiceDate) invoiceDateInput.value = draft.invoiceDate

        const dueDateInput = formRef.current.elements.namedItem(
          "dueDate",
        ) as HTMLInputElement | null
        if (dueDateInput && draft.dueDate) dueDateInput.value = draft.dueDate

        const notesInput = formRef.current.elements.namedItem(
          "notes",
        ) as HTMLTextAreaElement | null
        if (notesInput && draft.notes) notesInput.value = draft.notes
      }

      // CustomerSelect/LocationSelect both seed their selection from
      // `defaultValue` into internal state, so a restored value only shows
      // once they remount.
      setCustomerSelectKey((key) => key + 1)
      setLocationSelectKey((key) => key + 1)

      toast.success("Picked up where you left off")
    } else if (newCustomerId) {
      setCustomerId(newCustomerId)
      setCustomerSelectKey((key) => key + 1)
    }

    // Strip the one-shot param via history rather than router.replace, so
    // Next doesn't re-render the route and undo what we just restored.
    if (newCustomerId) {
      window.history.replaceState({}, "", window.location.pathname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Selecting a real Purity updates purityLabel (the true value), keeps the
  // legacy `purity` enum in sync (matchLegacyPurityType) purely so anything
  // not yet reading purityLabel still shows something, and auto-fills HM
  // Charge from the chosen purity's own isHallmarkable flag (falls back to
  // the legacy isHallmarkablePurity check for a line whose purity hasn't
  // gone through this picker, e.g. a linked stock item).
  const selectPurity = (item: LineItem, storeMetalPurityId: string) => {
    const options = metalPuritiesCache[item.metalTypeId] ?? []
    const selected = options.find((option) => option.id === storeMetalPurityId)
    const metal = metalById.get(item.metalTypeId)
    const family = metal ? classifyPurityFamily(metal) : null
    const legacyPurity = matchLegacyPurityType(family, selected?.label) ?? ""
    const patch: Partial<LineItem> = { purityLabel: selected?.label ?? "", purity: legacyPurity }
    if (!item.hmChargeTouched && (selected?.isHallmarkable || isHallmarkablePurity(legacyPurity))) {
      patch.hmCharge = hallmarkChargePerPiece
    }
    updateItem(item.key, patch)
  }

  const primaryUnitFor = (item: LineItem) => metalById.get(item.metalTypeId)?.primaryUnit ?? "GRAM"

  // Whether this line's Carat Weight field should show/convert: an explicit
  // Diamond purity (today's existing signal), or a metal name that reads as
  // Diamond/Stone (the only way to catch a Stone line — there's no PurityType
  // for loose gemstones).
  const isCaratLine = (item: LineItem) =>
    item.purity === "DIAMOND" || isCaratWeighedMetal(metalNameByTypeId[item.metalTypeId])

  const handleCaratWeightChange = (item: LineItem, value: string) => {
    const caratWeight = Number(value) || 0
    const patch: Partial<LineItem> = { caratWeight }

    if (isCaratLine(item)) {
      const caratNum = Number(value)
      if (value.trim() !== "" && Number.isFinite(caratNum)) {
        const gramsPerCarat = resolveGramsPerCarat(item.purity, caratConversionRates)
        patch.netWeight = Number((caratNum * gramsPerCarat).toFixed(5))
        patch.netTouched = true
      }
    } else if (item.hasStoneComponent) {
      if (!item.stoneChargeTouched) {
        patch.stoneCharge = Number((item.stoneRate * caratWeight).toFixed(2))
      }

      // Net Stone Weight mirrors Stone Carat Weight until the user edits Net
      // Stone Weight directly (netStoneWeightTouched — same override escape
      // hatch as stoneChargeTouched). stoneWeightInput is always grams
      // internally (see LineItem's own doc comment) — caratWeight is always
      // carats, so this conversion doesn't depend on stoneWeightUnit at all;
      // this also then feeds the metal's own Net Weight via the same
      // gross/stone/dmo calc used elsewhere, unless that has separately been
      // taken over (netTouched).
      if (!item.netStoneWeightTouched) {
        const gramsPerCarat = resolveGramsPerCarat(item.purity, caratConversionRates)
        const stoneWeightInput = Number((caratWeight * gramsPerCarat).toFixed(5))
        patch.stoneWeightInput = stoneWeightInput

        if (!item.netTouched) {
          const derived = deriveNetWeight(item.grossWeight, stoneWeightInput, item.dmoWeight)
          if (derived !== null) patch.netWeight = derived
        }
      }
    }

    updateItem(item.key, patch)
  }

  // Stone Rate only applies to composite lines (metal-primary with an
  // embedded stone) — isCaratLine items price the whole line via
  // rate × caratWeight through lineQuantity already, no separate Stone
  // Rate concept for them.
  const handleStoneRateChange = (item: LineItem, value: string) => {
    const stoneRate = Number(value) || 0
    const patch: Partial<LineItem> = { stoneRate }

    if (!item.stoneChargeTouched) {
      patch.stoneCharge = Number((stoneRate * item.caratWeight).toFixed(2))
    }

    updateItem(item.key, patch)
  }

  const handleStoneChargeChange = (item: LineItem, value: string) => {
    updateItem(item.key, { stoneCharge: Number(value) || 0, stoneChargeTouched: true })
  }

  // Editing Net Stone Weight directly is the escape hatch out of the Stone
  // Carat Weight auto-fill above — same override pattern as Stone Charge.
  // `value` is typed in item.stoneWeightUnit; stoneWeightInput itself always
  // stays grams internally (see LineItem's doc comment).
  const handleStoneWeightInputChange = (item: LineItem, value: string) => {
    const gramsPerCarat = resolveGramsPerCarat(item.purity, caratConversionRates)
    const stoneWeightInput = toPrimaryUnit(Number(value) || 0, item.stoneWeightUnit, "GRAM", gramsPerCarat)
    const derived = item.netTouched
      ? null
      : deriveNetWeight(item.grossWeight, stoneWeightInput, item.dmoWeight)
    updateItem(item.key, {
      stoneWeightInput,
      netStoneWeightTouched: true,
      ...(derived !== null ? { netWeight: derived } : {}),
    })
  }

  // Purely a display/entry-unit switch — stoneWeightInput is already grams
  // internally, so the physical value never changes here, only what's shown.
  const handleStoneWeightUnitChange = (item: LineItem, unit: "GRAM" | "CARAT") => {
    updateItem(item.key, { stoneWeightUnit: unit })
  }

  // `value` is typed in item.netWeightUnit; netWeight itself always stays
  // grams internally (see LineItem's doc comment).
  const handleNetWeightChange = (item: LineItem, value: string) => {
    const gramsPerCarat = resolveGramsPerCarat(item.purity, caratConversionRates)
    const netWeight = toPrimaryUnit(Number(value) || 0, item.netWeightUnit, "GRAM", gramsPerCarat)
    const patch: Partial<LineItem> = { netWeight, netTouched: true }

    if (isCaratLine(item)) {
      patch.caratWeight = Number((netWeight / gramsPerCarat).toFixed(3))
    }

    updateItem(item.key, patch)
  }

  // Diamond items price per carat, not per gram — mirrors lineQuantity in
  // invoice-actions.ts so the live-preview total here never disagrees with
  // what the server actually saves. Stone lines keep pricing off Net Weight
  // (unchanged) — only the Carat Weight field's conversion convenience
  // extends to Stone, not the pricing quantity itself. Net/Carat Weight is
  // per piece, so the priced quantity is that times how many pieces (Qty) —
  // this used to ignore Qty entirely.
  const lineQuantity = (item: LineItem) =>
    (item.purity === "DIAMOND" ? item.caratWeight : item.netWeight) * (item.quantity || 1)

  // A multi-part piece is valued row by row (lib/piece-components.ts);
  // amounts are per piece, so quantity multiplies them.
  const pieceOf = (item: LineItem) => pieceTotals(item.components, { valuation: "net" })
  const lineMetalValue = (item: LineItem) =>
    item.multiPart ? pieceOf(item).metalValue * (item.quantity || 1) : item.rate * lineQuantity(item)
  const lineStoneValue = (item: LineItem) =>
    item.multiPart ? pieceOf(item).stoneValue * (item.quantity || 1) : item.stoneCharge

  // Taxable value per line: metal + making + HM + stone, less any per-line
  // scheme discount — the same base the reference format's SGST/CGST/IGST
  // columns are computed against.
  const baseTaxableValue = (item: LineItem) =>
    lineMetalValue(item) +
    item.makingCharge +
    item.hmCharge +
    lineStoneValue(item) -
    item.schemeDiscount

  // Offer / gift voucher (lib/promotions.ts) — previewed live from the
  // applied code; createInvoice re-checks the code and recomputes. Its share
  // per line comes off that line's taxable value (before GST).
  const promoLines = (): PromotionLine[] =>
    items
      .filter((item) => item.stockLinkDecided && (item.itemName.trim() || item.inventoryStockId))
      .map((item) => {
        const stock = item.inventoryStockId ? stockItems.find((s) => s.id === item.inventoryStockId) : undefined
        const metalTypeIds = item.multiPart
          ? item.components.flatMap((row) => (row.kind === "METAL" && row.metalTypeId ? [row.metalTypeId] : []))
          : item.metalTypeId
            ? [item.metalTypeId]
            : []
        return {
          key: item.key,
          categoryId: (stock ? stock.categoryId : item.categoryId) || null,
          metalTypeIds,
          quantity: item.quantity || 1,
          value: Math.round(baseTaxableValue(item) * 100) / 100,
          making: item.makingCharge + item.hmCharge,
        }
      })
  const promoResult = appliedPromotion ? computePromotion(appliedPromotion.promotion, promoLines()) : null
  const promoOf = (item: LineItem) => (promoResult?.ok ? promoResult.perLine[item.key] ?? 0 : 0)
  const promoTotal = promoResult?.ok ? promoResult.total : 0

  const taxableValue = (item: LineItem) => baseTaxableValue(item) - promoOf(item)

  // This line's own GST %, resolved from its own gstRateId against the
  // full `gstRates` prop — falls back to the document-level default
  // (`gstRate` above) when blank or unresolved (e.g. a since-deleted rate,
  // or an older-shaped payload with no gstRateId at all yet), never throws.
  // Composition override stays identical regardless of which rate this
  // resolves to, same reasoning as `gstRate` itself above.
  const lineGstRatePercent = (item: LineItem) => {
    if (gstScheme === "COMPOSITION") return 0
    return gstRates.find((r) => r.id === item.gstRateId)?.ratePercent ?? gstRate
  }

  // Scheme- and inter-state-aware: zero on a Composition store regardless
  // of rate, IGST-only on an inter-state sale, SGST+CGST split otherwise —
  // see computeGst()'s own doc comment in lib/gst.ts.
  const lineGst = (item: LineItem) => {
    const round = (value: number) => Math.round(value * 100) / 100
    if (item.multiPart) {
      // Each metal/stone at its own GST rate; making/HM (less any scheme
      // discount) at the line's own rate.
      // An offer's share of this line scales every part's taxable value.
      const base = baseTaxableValue(item)
      const factor = base > 0 ? Math.max(0, (base - promoOf(item)) / base) : 1
      const split = (taxable: number, percent: number) =>
        computeGst(taxable * factor, gstScheme === "COMPOSITION" ? 0 : percent, gstScheme, storeState, deliveryState)
      const rateOf = (id: string) => gstRates.find((r) => r.id === id)?.ratePercent ?? lineGstRatePercent(item)
      const parts = pieceGst(item.components, { valuation: "net" }, item.quantity || 1, rateOf, split)
      const making = split(item.makingCharge + item.hmCharge - item.schemeDiscount, lineGstRatePercent(item))
      return {
        sgst: round(parts.sgst + making.sgst),
        cgst: round(parts.cgst + making.cgst),
        igst: round(parts.igst + making.igst),
        isInterState: making.isInterState,
      }
    }
    const breakdown = computeGst(taxableValue(item), lineGstRatePercent(item), gstScheme, storeState, deliveryState)
    return {
      sgst: round(breakdown.sgst),
      cgst: round(breakdown.cgst),
      igst: round(breakdown.igst),
      isInterState: breakdown.isInterState,
    }
  }

  const lineTotal = (item: LineItem) => {
    const { sgst, cgst, igst } = lineGst(item)
    return taxableValue(item) + sgst + cgst + igst
  }

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + lineMetalValue(item), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items],
  )
  const makingChargesTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.makingCharge + item.hmCharge, 0),
    [items],
  )
  const stoneChargesTotal = useMemo(
    () => items.reduce((sum, item) => sum + lineStoneValue(item), 0),
    [items],
  )
  const schemeDiscountTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.schemeDiscount, 0),
    [items],
  )
  const taxAmount = useMemo(
    () =>
      items.reduce((sum, item) => {
        const { sgst, cgst, igst } = lineGst(item)
        return sum + sgst + cgst + igst
      }, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, gstRate, gstScheme, storeState, deliveryState],
  )
  // Aggregated once here instead of shown per-line — a line's own SGST/CGST/
  // IGST split used to render as three extra read-only boxes in every line
  // item's Details region, which was a lot of repeated information for what
  // is, document-wide, always the same inter-state/intra-state split (it's
  // driven by store state vs customer state, not anything line-specific).
  const gstBreakdownTotal = useMemo(
    () =>
      items.reduce(
        (acc, item) => {
          const { sgst, cgst, igst, isInterState } = lineGst(item)
          return {
            sgst: acc.sgst + sgst,
            cgst: acc.cgst + cgst,
            igst: acc.igst + igst,
            isInterState: acc.isInterState || isInterState,
          }
        },
        { sgst: 0, cgst: 0, igst: 0, isInterState: false },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, gstRate, gstScheme, storeState, deliveryState, appliedPromotion],
  )
  const rawTotal =
    subtotal +
    makingChargesTotal +
    stoneChargesTotal -
    discount -
    schemeDiscountTotal -
    promoTotal +
    taxAmount
  // Standard Indian-billing convention: the Total shown/saved is rounded to
  // the nearest rupee, with the small signed adjustment surfaced as its own
  // line — same computeRoundOff the server uses, so what's previewed here is
  // exactly what createInvoice/updateInvoice will persist.
  const { roundOffAmount, totalAmount } = computeRoundOff(rawTotal, roundOffOverride)

  // Old gold is applied against the bill first (after store credit), so
  // cash only covers what's left — the same order createInvoice uses.
  const oldGoldValue = oldGoldLines.reduce(
    (sum, line) =>
      sum +
      oldGoldLineAmounts(
        line,
        metalPuritiesCache[line.metalTypeId],
        enumFineness,
        Boolean(metalById.get(line.metalTypeId)?.isGemstone),
        metalPuritiesCache,
      ).total,
    0,
  )
  // New invoice: against the bill less store credit. Editing: against what's
  // still unpaid — and never when the invoice already has an exchange.
  const exchangeEditable = !(editInvoiceId && existingExchange)
  const oldGoldSplit = splitOldGoldValue(
    exchangeEditable ? oldGoldValue : 0,
    totalAmount - (editInvoiceId ? alreadyPaid : creditApplied),
  )
  const paidAmount = paidBeforeOldGold + oldGoldSplit.applied
  const balanceAmount = Math.max(0, totalAmount - paidAmount)
  const oldGoldPayoutMissing =
    oldGoldSplit.excess > 0 && oldGoldExcessMode === "PAID_OUT" && !oldGoldPayoutMethod

  const itemsJson = JSON.stringify(
    items.map((item) => {
      const { sgst, cgst, igst } = lineGst(item)
      // Every weight below is tracked internally in grams (see LineItem's
      // doc comment) — converted here, once, to this line's own metal's
      // configured Primary Unit, which is what actually gets persisted.
      const gramsPerCarat = resolveGramsPerCarat(item.purity, caratConversionRates)
      const unit = primaryUnitFor(item)
      const toUnit = (grams: number) => toPrimaryUnit(grams, "GRAM", unit, gramsPerCarat)
      return {
        itemName: item.itemName || "Item",
        metalTypeId: item.metalTypeId || null,
        purity: item.purity || null,
        purityLabel: item.purityLabel || null,
        quantity: item.quantity || 1,
        grossWeight: toUnit(item.grossWeight) || null,
        netWeight: toUnit(item.netWeight) || null,
        caratWeight: item.caratWeight || null,
        rate: item.rate || null,
        makingCharge: item.makingCharge,
        makingChargeType: item.makingChargeType,
        stoneCharge: item.stoneCharge,
        stoneRate: item.hasStoneComponent ? item.stoneRate || null : null,
        stoneMetalTypeName: item.hasStoneComponent ? item.stoneMetalTypeName || null : null,
        stoneTypeNames:
          item.hasStoneComponent && item.stoneTypeNames.length
            ? item.stoneTypeNames.join(", ")
            : null,
        dmoWeight: toUnit(item.dmoWeight) || null,
        stoneWeight: toUnit(item.stoneWeightInput) || null,
        hmCharge: item.hmCharge,
        // The offer's share rides on the line's scheme discount (pre-GST);
        // promoDiscount lets the server tell the two apart and re-check it.
        schemeDiscount: Math.round((item.schemeDiscount + promoOf(item)) * 100) / 100,
        promoDiscount: promoOf(item),
        sgstAmount: sgst,
        cgstAmount: cgst,
        igstAmount: igst,
        hsnCode: item.hsnCode || null,
        inventoryStockId: item.inventoryStockId || null,
        gstRateId: item.gstRateId || null,
        categoryId: item.inventoryStockId ? null : item.categoryId || null,
        categoryTypeId: item.inventoryStockId ? null : item.categoryTypeId || null,
        targetStyleId: item.inventoryStockId ? null : item.targetStyleId || null,
        vendorId: item.inventoryStockId ? null : item.sourcePartyId || null,
        multiPart: item.multiPart && item.components.length > 0,
        components: item.multiPart ? toComponentPayload(item.components, { valuation: "net" }) : [],
      }
    }),
  )

  // Selling price is mandatory on every line — an invoice with a $0 rate is
  // not a real sale. Checked against every item (not just "filled" ones),
  // matching the server's own guard in createInvoice.
  const hasInvalidRate = items.some((item) =>
    item.multiPart ? !(pieceOf(item).total > 0) : !(item.rate > 0),
  )

  // Every line must go through the Link Stock Item picker — either linked
  // to real stock, or explicitly sent down "Create New Line Item" — so a
  // line can't be added by typing straight into Item Name without ever
  // touching the picker. Same unconditional-per-item check as hasInvalidRate.
  const hasInvalidStockLink = items.some((item) => !item.stockLinkDecided)

  const incompleteNewItem = items.find((item) => missingProductFields(item).length > 0)

  // Only meaningful for a fresh invoice — see paymentRows' own comment
  // above. Zero-amount rows (a split row the user opened but never filled
  // in) are dropped here rather than sent through, matching parseOptionalPayments'
  // server-side requirement that any row it does receive have a real amount.
  const paymentsJson = JSON.stringify(
    paymentRows
      .filter((row) => row.amount > 0)
      .map((row) => ({
        method: row.method,
        amount: row.amount,
        reference: row.reference || null,
        bankName: row.bankName || null,
        attachmentUrl: row.attachmentUrl || null,
      })),
  )
  const paidOverTotal = !editInvoiceId && paidAmount > totalAmount

  // Shared column layout for the compact line-item row and its header, so
  // labels stay pixel-aligned with the inputs underneath them. Deliberately
  // a fixed, non-stacking grid (unlike the rest of this form's 1-col-on-
  // mobile pattern) — this section is meant to read as a dense spreadsheet-
  // style table (per the reference screenshot), so on a narrow viewport it
  // scrolls horizontally inside its own container instead of restacking
  // into a card.
  const compactRowGridCols =
    "grid-cols-[28px_minmax(160px,2fr)_76px_168px_112px_104px_116px_28px]"

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        // Deliberately not `action={formAction}` directly on the form:
        // React resets a form's uncontrolled fields once an action-bound
        // submission settles, regardless of whether the action's own
        // returned state says success or failure — so a plain validation
        // error wiped every other field the user had already typed.
        // Calling the same dispatcher by hand from a prevented submit
        // sidesteps that auto-reset while keeping identical pending/error-
        // state behavior.
        event.preventDefault()
        if (hasInvalidStockLink) {
          toast.error("Link every line item to a stock item, or choose \"Create New Line Item\" for a custom piece, before creating the invoice.")
          return
        }
        if (incompleteNewItem) {
          const missing = missingProductFields(incompleteNewItem)
          toast.error(
            `"${incompleteNewItem.itemName.trim() || "New line item"}" will be added as a new product — fill in ${missing.join(", ")} first.`,
          )
          setExpandedKeys((prev) => new Set(prev).add(incompleteNewItem.key))
          return
        }
        if (hasInvalidRate) {
          toast.error("Enter a selling price (Rate / g) for every line item before creating the invoice.")
          return
        }
        formAction(new FormData(event.currentTarget))
      }}
      className="space-y-6"
    >
      <input type="hidden" name="itemsJson" value={itemsJson} />
      <input type="hidden" name="discount" value={discount} />
      <input type="hidden" name="roundOffAmount" value={roundOffAmount} />
      <input type="hidden" name="taxAmount" value={taxAmount} />
      <input type="hidden" name="gstRateId" value={gstRateId} />
      <input type="hidden" name="paidAmount" value={paidAmount} />
      <input type="hidden" name="paymentsJson" value={paymentsJson} />
      {replacesId && <input type="hidden" name="replacesId" value={replacesId} />}

      {replacesInvoiceNumber && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Replacing cancelled invoice <span className="font-medium">{replacesInvoiceNumber}</span> —
          review the details below before saving.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Party {!editInvoiceId && <RequiredMark />}</Label>
          {editInvoiceId ? (
            // The customer isn't editable here — this changes line items
            // and amounts, not who's billed. Moving an invoice's ledger
            // history to a different customer is a distinct operation
            // nobody asked for. Still posted as a hidden field since
            // customerId is part of the form's shape either way.
            <>
              <input type="hidden" name="customerId" value={customerId} />
              <div className="flex h-11 items-center rounded-md border bg-muted px-3 text-sm">
                {customers.find((c) => c.id === customerId)?.name ?? "—"}
              </div>
            </>
          ) : (
            <CustomerSelect
              key={customerSelectKey}
              customers={customers}
              defaultValue={customerId}
              onChange={(id) => setCustomerId(id)}
              onBeforeAddNew={saveDraft}
              name="customerId"
            />
          )}
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Invoice Date</Label>
          <Input
            type="date"
            name="invoiceDate"
            className="h-11"
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </div>

        {showDueDate && (
          <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label>Due Date</Label>
            <Input type="date" name="dueDate" className="h-11" min={todayForDateInput()} />
          </div>
        )}

        {showLocationField ? (
          <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label>Store Location</Label>
            <LocationSelect
              key={locationSelectKey}
              locations={locations}
              name="locationId"
              defaultValue={locationId}
              onChange={setLocationId}
            />
          </div>
        ) : (
          // Collapsed (single location, or an unrestricted role that skips
          // picking one — see LocationSelect's own doc comment): renders
          // only a hidden input, nothing visible — so it's kept OUTSIDE any
          // grid-column wrapper here, rather than one still reserving an
          // empty-looking slot next to Due Date for a field with nothing
          // to show.
          <LocationSelect
            key={locationSelectKey}
            locations={locations}
            name="locationId"
            defaultValue={locationId}
            onChange={setLocationId}
          />
        )}

        {/* No Delivery Locations picked in Settings → no field at all; the
            sale stays intra-state, same as leaving it blank. */}
        {states.length === 0 ? (
          <>
            <input type="hidden" name="deliveryState" value="" />
            <input type="hidden" name="deliveryStateCode" value="" />
          </>
        ) : (
        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          {showDeliveryPicker ? (
            <DeliveryLocationSelect
              states={states}
              value={deliveryState}
              onChange={(name, code) => {
                setDeliveryState(name)
                setDeliveryStateCode(code)
              }}
            />
          ) : (
            <>
              <Label>Delivery Location</Label>
              <input type="hidden" name="deliveryState" value="" />
              <input type="hidden" name="deliveryStateCode" value="" />
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full justify-start text-muted-foreground"
                onClick={() => setShowDeliveryPicker(true)}
              >
                <Plus className="h-4 w-4 mr-1.5" /> Add a delivery location
              </Button>
            </>
          )}
        </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>
            Line Items
            {filledCount > 0 ? (
              <span className="ml-1.5 font-normal text-muted-foreground">
                ({filledCount})
              </span>
            ) : null}
          </Label>

          <div className="flex items-center gap-2">
            {/* Only offered when there is something to clear, and it asks
                first — scanning twenty tags and losing them to a stray click
                is a long walk back. Confirmed in place rather than in a
                dialog, which is the pattern the rest of the app is moving
                to. */}
            {filledCount > 0 ? (
              confirmingClear ? (
                <>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={clearAllItems}
                  >
                    Remove all {filledCount}?
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmingClear(false)}
                  >
                    Keep
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmingClear(true)}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  Remove all
                </Button>
              )
            ) : null}
          </div>
        </div>

        {/* Above the lines, because it is how the lines get created — "Add
            Item" now lives here too, alongside the two scan routes, instead
            of its own separate button in the header above. */}
        {/* One row, two cards: how sale lines get added, and — on a new
            invoice — the Customer Exchange (what the customer sells you).
            The exchange's item cards open full width under the lines. */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <ScanToAddPanel
            className="h-full"
            onScanned={addScannedStock}
            onAddManualItem={() => setItems((prev) => [...prev, emptyLineItem(gstRateId)])}
          />
          {!exchangeEditable && existingExchange ? (
            <InvoiceOldGoldCard exchange={existingExchange} invoiceTotal={totalAmount} />
          ) : null}
          {exchangeEditable && (
            <OldGoldExchangeSection
              part="header"
              lines={oldGoldLines}
              onLinesChange={setOldGoldLines}
              metals={metals}
              origins={origins}
              onMetalsChange={setMetals}
              onOriginsChange={setOrigins}
              puritiesByMetal={metalPuritiesCache}
              ensurePurities={ensureMetalPurities}
              enumFineness={enumFineness}
              fineRates={fineRates}
              excess={oldGoldSplit.excess}
              excessMode={oldGoldExcessMode}
              onExcessModeChange={setOldGoldExcessMode}
              payoutMethod={oldGoldPayoutMethod}
              onPayoutMethodChange={setOldGoldPayoutMethod}
              payoutReference={oldGoldPayoutReference}
              onPayoutReferenceChange={setOldGoldPayoutReference}
            />
          )}
        </div>

        {/* This row is a fixed-width "spreadsheet" (see compactRowGridCols's
            own comment) that only fits without scrolling at lg:+ — below
            that, overflow-x-auto below scrolls it, but a native scrollbar
            alone is easy to miss (invisible-until-touched on iOS/Android,
            thin/subtle on some desktop browsers too), so this hint makes
            "there's more to the right" obvious instead of the GST/Amount
            columns just silently never being seen. */}
        <p className="flex items-center gap-1 text-xs text-muted-foreground lg:hidden">
          <MoveHorizontal className="h-3.5 w-3.5" />
          Scroll sideways to see GST and Amount
        </p>

        <div className="overflow-x-auto">
          <div className="min-w-[900px] space-y-2">
            {/* Table header for the compact rows below — labels only,
                same column widths as each row via compactRowGridCols. The
                leading/trailing blank spans line up with each row's own
                chevron and remove-item cells. */}
            <div
              className={`grid ${compactRowGridCols} items-center gap-2 px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground`}
            >
              <span />
              <span>Item</span>
              <span>Qty</span>
              <span>Net Wt</span>
              <span>Rate / g</span>
              <span>GST</span>
              <span>Amount</span>
              <span />
            </div>

            {items.map((item) => {
            // Once a line is linked to a Stock Item, the physical facts
            // about that piece (weight, purity, HSN, stone details) come
            // from Inventory and are shown read-only here — the invoice
            // uses the existing product/stock data rather than letting a
            // second, possibly-inconsistent copy of it be typed in at sale
            // time. Pricing (Rate, Making/Stone Charge, discounts) stays
            // editable regardless, since selling price is commonly re-keyed
            // to the day's metal rate independent of what the stock was
            // priced at when it was entered.
            const isLinked = Boolean(item.inventoryStockId)
            const isExpanded = expandedKeys.has(item.key)
            // Compact-row GST summary: the two intra-state components
            // combined into one figure, or the single inter-state one — the
            // full three-way SGST/CGST/IGST breakdown still renders in full
            // below, in the Details region; this is only a summary.
            const gst = lineGst(item)
            const gstTotal = gst.isInterState ? gst.igst : gst.sgst + gst.cgst
            // A not-yet-linked line being added as a new product groups
            // Metal Type and Purity with Category/Type in the "New product
            // details" box. A linked line shows the same box read-only,
            // filled from the picked piece's Product, so both kinds of line
            // read the same way.
            const showNewProductDetails = !isLinked && item.stockLinkDecided
            // "Does this piece have a stone?" — asked first on a new line
            // (top of New product details); the stone's own fields follow.
            const setHasStone = (checked: boolean) =>
              updateItem(item.key, {
                hasStoneComponent: checked,
                // Net Stone Weight and Stone Charge are hidden once off —
                // clear them so a hidden field can't keep submitting.
                ...(checked
                  ? {}
                  : { stoneWeightInput: 0, netStoneWeightTouched: false, stoneCharge: 0, stoneChargeTouched: false }),
              })
            // Multi-part piece: rows drive the line's own metal/purity/weights
            // (first metal; combined net), so category filtering and the
            // "Still needed" checks keep working unchanged.
            const setComponents = (rows: PieceComponentDraft[]) => {
              const firstMetal = rows.find((row) => row.kind === "METAL")
              const totals = pieceTotals(rows, { valuation: "net" })
              updateItem(item.key, {
                components: rows,
                metalTypeId: firstMetal?.kind === "METAL" ? firstMetal.metalTypeId : "",
                purity: firstMetal?.kind === "METAL" ? firstMetal.purity : "",
                purityLabel: firstMetal?.kind === "METAL" ? firstMetal.purityLabel : "",
                netWeight: totals.metalNet,
                grossWeight: totals.metalGross + totals.stoneGrams || totals.metalNet,
                netTouched: true,
              })
            }
            const setMultiPart = (on: boolean) => {
              if (!on) {
                updateItem(item.key, { multiPart: false, components: [] })
                return
              }
              const metalRow = { ...newMetalRow(item.rate, item.gstRateId), metalTypeId: item.metalTypeId, purity: item.purity, purityLabel: item.purityLabel, grossWeight: item.grossWeight, netWeight: item.netWeight }
              const rows: PieceComponentDraft[] = [metalRow, newMetalRow(0, item.gstRateId), newStoneRow(item.gstRateId)]
              updateItem(item.key, { multiPart: true, hasStoneComponent: false, stoneCharge: 0, stoneWeightInput: 0 })
              setComponents(rows)
            }
            const piecesEditor = (
              <PieceComponentsEditor
                rows={item.components}
                onRowsChange={setComponents}
                metals={metals}
                origins={origins}
                puritiesByMetal={metalPuritiesCache}
                ensurePurities={ensureMetalPurities}
                enumFineness={enumFineness}
                valuation="net"
                gstRates={gstScheme === "COMPOSITION" ? undefined : gstRates}
                defaultGstRateId={item.gstRateId}
                rateForMetal={(metal) => metal.sellingPrice ?? 0}
                lockPhysical={isLinked}
                testIdPrefix="sale-piece"
              />
            )
            const stoneFields = (
              <div className="rounded-md border-2 border-dashed border-emerald-400 bg-emerald-50 p-3">
                <StoneComponentFields
                  metals={metals}
                  origins={origins}
                  onMetalsChange={setMetals}
                  onOriginsChange={setOrigins}
                  stoneMetalTypeName={item.stoneMetalTypeName}
                  onStoneChange={(name, typeNames) =>
                    updateItem(item.key, { stoneMetalTypeName: name, stoneTypeNames: typeNames })
                  }
                  selectedTypeNames={item.stoneTypeNames}
                  onTypesChange={(names) => updateItem(item.key, { stoneTypeNames: names })}
                  caratWeight={item.caratWeight}
                  onCaratWeightChange={(value) => handleCaratWeightChange(item, value)}
                  stoneRate={item.stoneRate}
                  onStoneRateChange={(value) => handleStoneRateChange(item, value)}
                  stoneCharge={item.stoneCharge}
                  onStoneChargeChange={(value) => handleStoneChargeChange(item, value)}
                  stoneChargeTouched={item.stoneChargeTouched}
                  stoneWeightInput={toPrimaryUnit(
                    item.stoneWeightInput,
                    "GRAM",
                    item.stoneWeightUnit,
                    resolveGramsPerCarat(item.purity, caratConversionRates),
                  )}
                  onStoneWeightInputChange={(value) => handleStoneWeightInputChange(item, value)}
                  stoneWeightUnit={item.stoneWeightUnit}
                  onStoneWeightUnitChange={(unit) => handleStoneWeightUnitChange(item, unit)}
                  netStoneWeightTouched={item.netStoneWeightTouched}
                  lockPhysicalFields={isLinked}
                />
                {isLinked && (
                  <StoneExtras
                    row={stockItems.find((s) => s.id === item.inventoryStockId)?.linkedStone ?? {}}
                    testId="sale-linked-stone-extras"
                  />
                )}
              </div>
            )
            const linkedStock = isLinked ? stockItems.find((s) => s.id === item.inventoryStockId) : undefined
            const metalPurityFields = (
              <>
                    <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                      <Label className="text-xs">Metal Type {!isLinked && <RequiredMark />}</Label>
                      <div className="flex gap-1.5">
                        <Select
                          value={item.metalTypeId}
                          onValueChange={(value) => {
                            ensureMetalPurities(value)
                            const category = categories.find((c) => c.id === item.categoryId)
                            const categoryStillApplies =
                              !category || category.metalTagIds.length === 0 || category.metalTagIds.includes(value)
                            updateItem(item.key, {
                              metalTypeId: value,
                              purity: "",
                              purityLabel: "",
                              ...(categoryStillApplies ? {} : { categoryId: "", categoryTypeId: "" }),
                            })
                          }}
                          disabled={isLinked}
                        >
                          <SelectTrigger className="h-11 w-full">
                            <SelectValue placeholder="Select metal" />
                          </SelectTrigger>
                          <SelectContent>
                            {metals
                              .filter((metal) => !metal.isGemstone && (metal.isActive || metal.id === item.metalTypeId))
                              .map((metal) => (
                                <SelectItem key={metal.id} value={metal.id}>
                                  {metal.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          className="h-11 w-9 shrink-0 px-0"
                          title="Add Metal Type"
                          disabled={isLinked}
                          onClick={() => setAddMetalForKey(item.key)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                      <Label className="text-xs">Purity</Label>
                      <div className="flex gap-1.5">
                        <Select
                          value={(metalPuritiesCache[item.metalTypeId] ?? []).find((option) => option.label === item.purityLabel)?.id ?? "__none__"}
                          onValueChange={(value) => {
                            // Radix fires "" when the value lands before its option has
                            // loaded (purities load async) — not a pick; "None" is "__none__".
                            if (!value) return
                            selectPurity(item, value === "__none__" ? "" : value)
                          }}
                          disabled={isLinked || !item.metalTypeId}
                        >
                          <SelectTrigger className="h-11 w-full">
                            <SelectValue placeholder={item.metalTypeId ? "Select purity" : "Select a metal first"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {(metalPuritiesCache[item.metalTypeId] ?? []).map((option) => (
                              <SelectItem key={option.id} value={option.id}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          className="h-11 w-9 shrink-0 px-0"
                          title="Add Purity"
                          disabled={isLinked || !item.metalTypeId}
                          onClick={() => setAddPurityForKey(item.key)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
              </>
            )

            return (
            <div key={item.key} className="rounded-lg border">
              {/* Always-visible compact row — one dense line per item, the
                  spreadsheet-style summary from the reference screenshot.
                  Every input here is the exact same state/handler as the
                  Details region below, just relocated. */}
              <div className={`grid ${compactRowGridCols} items-start gap-2 p-2`}>
                <button
                  type="button"
                  onClick={() => toggleExpanded(item.key)}
                  className="mt-1.5 text-muted-foreground hover:text-foreground"
                  aria-label={isExpanded ? "Collapse line item details" : "Expand line item details"}
                  aria-expanded={isExpanded}
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>

                <div className="space-y-1">
                  {/* Search-and-select is the default way onto this line —
                      picking a stock item populates every physical field
                      below and opens the Details region (see
                      applyStockToItem). Manual typing is still available,
                      but only once "Create New Line Item" has been chosen
                      explicitly (stockLinkDecided tracks that choice); the
                      search icon button switches back. */}
                  {item.stockLinkDecided && !item.inventoryStockId ? (
                    <div className="flex gap-1">
                      <Input
                        value={item.itemName}
                        placeholder="Item name"
                        className="flex-1"
                        onChange={(e) => updateItem(item.key, { itemName: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() => updateItem(item.key, { stockLinkDecided: false })}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        aria-label="Search a stock item instead"
                        title="Search a stock item instead"
                      >
                        <Search className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <StockItemSelect
                      stockItems={stockItems}
                      value={item.inventoryStockId}
                      onValueChange={(value) => applyStockToItem(item.key, value)}
                      onCreateNew={() => {
                        updateItem(item.key, {
                          ...emptyLineItem(gstRateId),
                          key: item.key,
                          // Explicitly choosing to type this line by hand is
                          // itself the "decision" the picker requires — see
                          // stockLinkDecided's own doc comment.
                          stockLinkDecided: true,
                        })
                        // Opened, not collapsed: a new item becomes a real
                        // Product on save, and its required catalog fields
                        // (Category, Style, Gross Weight...) live in Details.
                        setExpandedKeys((prev) => new Set(prev).add(item.key))
                      }}
                      isDisabled={(stock) => availableForStock(stock.id, item.key) <= 0}
                      availableQty={(stock) => availableForStock(stock.id, item.key)}
                      placeholder="Search stock item..."
                      className="w-full"
                    />
                  )}
                  {!item.stockLinkDecided && (
                    <p className="text-[10px] leading-tight text-destructive">
                      Select a stock item, or choose &quot;Create New Line Item&quot;
                    </p>
                  )}
                  {/* createInvoice/updateInvoice mint a real Product + Stock
                      row for this line on save, then sell it from there —
                      see createStockForManualSaleLine. */}
                  {item.stockLinkDecided && !item.inventoryStockId && (
                    <p className="text-[10px] leading-tight text-muted-foreground">
                      A new product and stock entry will be added on save
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <Input
                    type="number"
                    min={1}
                    max={item.inventoryStockId ? availableForStock(item.inventoryStockId, item.key) : undefined}
                    // Empty while the field is genuinely blank mid-edit
                    // (e.g. clearing "1" to type "12") — forcing it back to
                    // 1 on every keystroke (the old `|| 1` fallback) made it
                    // impossible to ever actually delete/replace that
                    // digit. Same "show empty, not a forced minimum" as
                    // every other numeric field on this line (Rate, etc.).
                    value={item.quantity === 0 ? "" : item.quantity}
                    onChange={(e) => {
                      const requested = e.target.value === "" ? 0 : Number(e.target.value) || 0
                      const quantity = item.inventoryStockId
                        ? Math.min(requested, Math.max(availableForStock(item.inventoryStockId, item.key), 1))
                        : requested
                      updateItem(item.key, { quantity })
                    }}
                    onBlur={() => {
                      // Only enforced once editing is done, not mid-keystroke
                      // — an invoice can't actually be submitted with a 0/
                      // blank quantity (see hasInvalidRate-style guards), so
                      // this just restores a sane value for a field left
                      // empty rather than blocking typing along the way.
                      if (!item.quantity) updateItem(item.key, { quantity: 1 })
                    }}
                  />
                  {item.inventoryStockId && (
                    <p className="text-[10px] leading-tight text-muted-foreground">
                      {availableForStock(item.inventoryStockId, item.key)} in stock
                    </p>
                  )}
                </div>

                {item.multiPart ? (
                  <div className="space-y-1">
                    <div className="flex h-8 items-center rounded-md border bg-muted px-2 text-sm" data-testid="sale-line-net">
                      {pieceOf(item).metalNet.toFixed(3)} g
                    </div>
                    <p className="text-[10px] leading-tight text-muted-foreground">All metals</p>
                  </div>
                ) : (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    <Input
                      type="number"
                      step="any"
                      className={isLinked ? "flex-1 bg-muted" : "flex-1"}
                      value={
                        item.netWeight === 0
                          ? ""
                          : toPrimaryUnit(
                              item.netWeight,
                              "GRAM",
                              item.netWeightUnit,
                              resolveGramsPerCarat(item.purity, caratConversionRates),
                            )
                      }
                      readOnly={isLinked}
                      onChange={(e) => handleNetWeightChange(item, e.target.value)}
                    />
                    <Select
                      value={item.netWeightUnit}
                      onValueChange={(unit) => updateItem(item.key, { netWeightUnit: unit as "GRAM" | "CARAT" })}
                      disabled={isLinked}
                    >
                      <SelectTrigger className="w-14" size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GRAM">g</SelectItem>
                        <SelectItem value="CARAT">ct</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {!item.netTouched && (
                    <p className="text-[10px] leading-tight text-muted-foreground">Gross − stone</p>
                  )}
                </div>
                )}

                {item.multiPart ? (
                  <div className="space-y-1">
                    <div className="flex h-8 items-center rounded-md border bg-muted px-2 text-xs text-muted-foreground">Per metal</div>
                    {!(pieceOf(item).total > 0) && (
                      <p className="text-[10px] leading-tight text-destructive">Add rates to the metals/stones</p>
                    )}
                  </div>
                ) : (
                <div className="space-y-1">
                  <Input
                    type="number"
                    step="0.01"
                    value={item.rate === 0 ? "" : item.rate}
                    onChange={(e) =>
                      updateItem(item.key, { rate: Number(e.target.value) || 0 })
                    }
                  />
                  {!(item.rate > 0) && (
                    <p className="text-[10px] leading-tight text-destructive">Selling price is required</p>
                  )}
                </div>
                )}

                <div className="flex h-8 items-center rounded-md border bg-muted px-2 text-xs text-muted-foreground">
                  ₹{gstTotal.toFixed(2)}
                </div>

                <div className="flex h-8 items-center rounded-md border bg-muted px-2 text-sm font-medium">
                  ₹{lineTotal(item).toFixed(2)}
                </div>

                <div className="flex justify-center pt-1">
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(item.key)}
                      className="text-red-600 hover:text-red-700"
                      aria-label="Remove item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Details region — every other field for this line, unchanged
                  from before, just moved below the compact row and only
                  rendered while expanded. */}
              {isExpanded && (
                <div className="space-y-3 border-t p-4">
                  {linkedStock && (
                    <div className="space-y-2 rounded-lg border border-dashed p-3">
                      <p className="text-xs font-medium">Product details</p>
                      {item.multiPart && (
                        <div className="rounded-md border border-amber-300 bg-amber-50/60 p-2.5">{piecesEditor}</div>
                      )}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {!item.multiPart && metalPurityFields}
                        <LinkedProductDetails
                          categoryName={linkedStock.categoryName}
                          categoryTypeName={linkedStock.categoryTypeName}
                          targetStyleName={linkedStock.targetStyleName}
                          showStyle={showStyleField}
                          inputClassName="h-11"
                        />
                      </div>
                    </div>
                  )}
                  {/* New Product details — only for a "Create New Line
                      Item" line, which becomes a real catalog Product on
                      save. Same required fields as Add Product, so a piece
                      sold this way lands in the right Category/Style in
                      reports instead of an unclassified row. */}
                  {showNewProductDetails && (() => {
                    const missing = missingProductFields(item)
                    const lineCategories = categoriesForMetal(item.metalTypeId, item.categoryId)
                    const lineTypes = (categoryTypesCache[item.categoryId] ?? []).filter(
                      (type) => type.isActive || type.id === item.categoryTypeId,
                    )
                    const categoryRequired = !metalById.get(item.metalTypeId)?.isGemstone
                    return (
                      <div className="space-y-3 rounded-lg border border-dashed p-3">
                        <MultiPartQuestion checked={item.multiPart} onChange={setMultiPart} />
                        {item.multiPart ? (
                          <div className="rounded-md border border-amber-300 bg-amber-50/60 p-2.5">{piecesEditor}</div>
                        ) : (
                          <>
                            {!isCaratLine(item) && (
                              <StonePresenceQuestion checked={item.hasStoneComponent} onChange={setHasStone} />
                            )}
                            {!isCaratLine(item) && item.hasStoneComponent && stoneFields}
                          </>
                        )}
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-xs font-medium">New product details</p>
                          {missing.length > 0 && (
                            <p className="text-[11px] text-destructive">Still needed: {missing.join(", ")}</p>
                          )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {!item.multiPart && metalPurityFields}
                          <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                            <Label className="text-xs">
                              Category {categoryRequired && <RequiredMark />}
                            </Label>
                            <div className="flex gap-1.5">
                              <Select
                                value={item.categoryId || undefined}
                                onValueChange={(value) => {
                                  ensureCategoryTypes(value)
                                  updateItem(item.key, { categoryId: value, categoryTypeId: "" })
                                }}
                              >
                                <SelectTrigger className="h-11 w-full">
                                  <SelectValue placeholder={lineCategories.length ? "Select category" : "No categories yet"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {lineCategories.map((category) => (
                                    <SelectItem key={category.id} value={category.id}>
                                      {category.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                className="h-11 w-9 shrink-0 px-0"
                                title="Add Category"
                                onClick={() => setAddCategoryForKey(item.key)}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                            <Label className="text-xs">Type</Label>
                            <div className="flex gap-1.5">
                              <Select
                                value={item.categoryTypeId || "__none__"}
                                onValueChange={(value) =>
                                  updateItem(item.key, { categoryTypeId: value === "__none__" ? "" : value })
                                }
                                disabled={!item.categoryId}
                              >
                                <SelectTrigger className="h-11 w-full">
                                  <SelectValue placeholder={item.categoryId ? "Select type" : "Select a category first"} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">None</SelectItem>
                                  {lineTypes.map((type) => (
                                    <SelectItem key={type.id} value={type.id}>
                                      {type.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                className="h-11 w-9 shrink-0 px-0"
                                title="Add Type"
                                disabled={!item.categoryId}
                                onClick={() => setAddTypeForKey(item.key)}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {showStyleField && (
                            <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                              <Label className="text-xs">
                                Style <RequiredMark />
                              </Label>
                              <Select
                                value={item.targetStyleId || undefined}
                                onValueChange={(value) => updateItem(item.key, { targetStyleId: value })}
                              >
                                <SelectTrigger className="h-11 w-full">
                                  <SelectValue placeholder="Select style" />
                                </SelectTrigger>
                                <SelectContent>
                                  {styles
                                    .filter((style) => style.isActive || style.id === item.targetStyleId)
                                    .map((style) => (
                                      <SelectItem key={style.id} value={style.id}>
                                        {style.name}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}

                          <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                            <Label className="text-xs">
                              Purchased From ({supplierModuleEnabled ? "Supplier" : "Party"}) <RequiredMark />
                            </Label>
                            <SourcePartySelect
                              parties={suppliers}
                              value={item.sourcePartyId ?? ""}
                              onChange={(value) => updateItem(item.key, { sourcePartyId: value })}
                              termLabel={supplierModuleEnabled ? "supplier" : "party"}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                  {/* One consistent grid for the whole row — Link Stock
                      Item used to sit alone in its own half-width row
                      while Purity/Gross Weight/etc were each a much
                      narrower sixth, reading as inconsistently oversized
                      next to them. Now it's just the widest cell (2 of 6
                      columns) in the same grid everything else shares. */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {!showNewProductDetails && !linkedStock && metalPurityFields}

                    {!item.multiPart && (
                    <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                      <Label className="text-xs">Gross Weight {!isLinked && <RequiredMark />}</Label>
                      <div className="flex gap-1">
                        <Input
                          type="number"
                          step="any"
                          className={isLinked ? "h-11 flex-1 bg-muted" : "h-11 flex-1"}
                          value={
                            item.grossWeight === 0
                              ? ""
                              : toPrimaryUnit(
                                  item.grossWeight,
                                  "GRAM",
                                  item.grossWeightUnit,
                                  resolveGramsPerCarat(item.purity, caratConversionRates),
                                )
                          }
                          readOnly={isLinked}
                          onChange={(e) => {
                            const gramsPerCarat = resolveGramsPerCarat(item.purity, caratConversionRates)
                            const grossWeight = toPrimaryUnit(Number(e.target.value) || 0, item.grossWeightUnit, "GRAM", gramsPerCarat)
                            const derived = item.netTouched
                              ? null
                              : deriveNetWeight(grossWeight, item.stoneWeightInput, item.dmoWeight)
                            updateItem(item.key, {
                              grossWeight,
                              ...(derived !== null ? { netWeight: derived } : {}),
                            })
                          }}
                        />
                        <Select
                          value={item.grossWeightUnit}
                          onValueChange={(unit) => updateItem(item.key, { grossWeightUnit: unit as "GRAM" | "CARAT" })}
                          disabled={isLinked}
                        >
                          <SelectTrigger className="h-11 w-16">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="GRAM">g</SelectItem>
                            <SelectItem value="CARAT">ct</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    )}

                    {isCaratLine(item) && (
                      <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                        <Label className="text-xs">Carat Weight (ct)</Label>
                        <Input
                          type="number"
                          step="any"
                          value={item.caratWeight === 0 ? "" : item.caratWeight}
                          readOnly={isLinked}
                          className={isLinked ? "bg-muted" : undefined}
                          onChange={(e) => handleCaratWeightChange(item, e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          {item.purity === "DIAMOND"
                            ? "Priced per carat, not per gram"
                            : "1 ct = 0.2 g — converts with Net Weight"}
                        </p>
                      </div>
                    )}

                    <MakingChargeInput
                      // A multi-part piece has no single rate — % making is
                      // on its metals' value (value per gram × net weight).
                      rate={item.multiPart ? (pieceOf(item).metalNet > 0 ? pieceOf(item).metalValue / pieceOf(item).metalNet : 0) : item.rate}
                      netWeight={item.multiPart ? pieceOf(item).metalNet : item.netWeight}
                      value={item.makingCharge}
                      onChange={(v) => updateItem(item.key, { makingCharge: v })}
                      chargeType={item.makingChargeType}
                      onChargeTypeChange={(t) => updateItem(item.key, { makingChargeType: t })}
                    />

                    {/* Per-line GST Rate — this line's own selection, no
                        document-level picker anymore. Options: active
                        rows, plus this line's own already-selected rate
                        even if it's since been deactivated (edit/replace).
                        Sits here, in the same row as Purity/Gross Weight/
                        Making Charge, rather than down with HSN Code/HM
                        Charge/Scheme-Discount — it's the one field in that
                        second row a merchant actually changes per line as
                        often as these, not a rarely-touched detail. */}
                    <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                      <Label className="text-xs">GST Rate</Label>
                      <Select
                        value={item.gstRateId || undefined}
                        disabled={gstScheme === "COMPOSITION"}
                        onValueChange={(value) => updateItem(item.key, { gstRateId: value })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select GST rate" />
                        </SelectTrigger>
                        <SelectContent>
                          {gstRates
                            .filter((r) => r.isActive || r.id === item.gstRateId)
                            .map((rate) => (
                              <SelectItem key={rate.id} value={rate.id}>
                                {rate.name} ({rate.ratePercent}%)
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Includes-a-Stone toggle sits here, in the same row as
                        Purity/Gross Weight/Making Charge, instead of its own
                        separate full-width row below — it's a single small
                        control, not worth a whole row of its own. Only the
                        toggle lives here; StoneComponentFields (once
                        checked) still renders as its own row below, since
                        it needs the room. No toggle applies to a carat-
                        weighed line at all (see below), so this cell is
                        simply empty there.

                        Once linked to a real Stock Item that's confirmed to
                        have no stone, the toggle is hidden entirely rather
                        than shown locked in the off position — a disabled
                        "Includes a Stone" control on a plain-metal product
                        reads as an option that might apply, when it never
                        can for this specific piece. Still shown (locked on)
                        when the linked stock does have one, and stays a
                        normal editable toggle for a manually-entered line. */}
                    {/* A new line asks this first, at the top of its "New
                        product details" box (see stoneQuestion below); only
                        a linked piece that has a stone shows it here, locked. */}
                    {!isCaratLine(item) && isLinked && item.hasStoneComponent && (
                      <div className="flex items-end pb-2">
                        <IncludesStoneToggle checked onChange={() => {}} disabled />
                      </div>
                    )}
                  </div>

                  {/* For a carat-weighed line (no "Includes a Stone" toggle
                      applies there at all), Stone Charge always shows here.
                      For every other line, it's only ever visible once
                      "Includes a Stone" is checked, inside that toggle's own
                      box below — while off, no stone means nothing to
                      charge for, so it stays fully hidden here. */}
                  {isCaratLine(item) && (
                    <div className="max-w-[200px] space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                      <Label className="text-xs">Stone Charge</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.stoneCharge === 0 ? "" : item.stoneCharge}
                        onChange={(e) => handleStoneChargeChange(item, e.target.value)}
                      />
                    </div>
                  )}

                  {/* StoneComponentFields only, once checked — the toggle
                      itself now lives in the grid row above. */}
                  {!isCaratLine(item) && item.hasStoneComponent && !showNewProductDetails && stoneFields}

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                      <Label className="text-xs">HSN Code</Label>
                      <Input
                        value={item.hsnCode}
                        readOnly={isLinked}
                        className={isLinked ? "bg-muted" : undefined}
                        onChange={(e) => updateItem(item.key, { hsnCode: e.target.value })}
                      />
                    </div>

                    {/* For a carat-weighed line (no "Includes a Stone" toggle
                        applies there at all — see above), Net Stone Weight has
                        no gating concept and always shows here. For every other
                        line, this field is only ever visible once "Includes a
                        Stone" is checked, inside that toggle's own box above —
                        while off, it stays fully hidden (not shown here) rather
                        than relocated, per the toggle's on/off gating. */}
                    {isCaratLine(item) && (
                      <div className="space-y-1">
                        <Label className="text-xs">Net Stone Weight</Label>
                        <div className="flex gap-1">
                          <Input
                            type="number"
                            step="any"
                            className={isLinked ? "flex-1 bg-muted" : "flex-1"}
                            value={
                              item.stoneWeightInput === 0
                                ? ""
                                : toPrimaryUnit(
                                    item.stoneWeightInput,
                                    "GRAM",
                                    item.stoneWeightUnit,
                                    resolveGramsPerCarat(item.purity, caratConversionRates),
                                  )
                            }
                            readOnly={isLinked}
                            onChange={(e) => handleStoneWeightInputChange(item, e.target.value)}
                          />
                          <Select
                            value={item.stoneWeightUnit}
                            onValueChange={(unit) => handleStoneWeightUnitChange(item, unit as "GRAM" | "CARAT")}
                            disabled={isLinked}
                          >
                            <SelectTrigger className="w-16">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="GRAM">g</SelectItem>
                              <SelectItem value="CARAT">ct</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                      <Label className="text-xs">HM Charge</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.hmCharge === 0 ? "" : item.hmCharge}
                        onChange={(e) => handleHmChargeChange(item, e.target.value)}
                      />
                    </div>

                    <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                      <Label className="text-xs">Scheme / Discount</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.schemeDiscount === 0 ? "" : item.schemeDiscount}
                        onChange={(e) =>
                          updateItem(item.key, { schemeDiscount: Number(e.target.value) || 0 })
                        }
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
            )
          })}
          </div>
        </div>
      </div>

      {/* Customer → Business: old gold handed in against this sale. A new
          invoice only — an existing exchange is never re-edited here. */}
      {exchangeEditable && (
        <OldGoldExchangeSection
          part="lines"
          lines={oldGoldLines}
          onLinesChange={setOldGoldLines}
          metals={metals}
          origins={origins}
          onMetalsChange={setMetals}
          onOriginsChange={setOrigins}
          puritiesByMetal={metalPuritiesCache}
          ensurePurities={ensureMetalPurities}
          enumFineness={enumFineness}
          fineRates={fineRates}
          excess={oldGoldSplit.excess}
          excessMode={oldGoldExcessMode}
          onExcessModeChange={setOldGoldExcessMode}
          payoutMethod={oldGoldPayoutMethod}
          onPayoutMethodChange={setOldGoldPayoutMethod}
          payoutReference={oldGoldPayoutReference}
          onPayoutReferenceChange={setOldGoldPayoutReference}
        />
      )}
      {exchangeEditable && (
        <>
          <input
            type="hidden"
            name="oldGoldJson"
            value={JSON.stringify(oldGoldLines.map(serializeOldGoldLine))}
          />
          <input type="hidden" name="oldGoldExcessMode" value={oldGoldExcessMode} />
          <input type="hidden" name="oldGoldPayoutMethod" value={oldGoldPayoutMethod} />
          <input type="hidden" name="oldGoldPayoutReference" value={oldGoldPayoutReference} />
        </>
      )}

      {/* Side by side rather than stacked — narrow, single-purpose fields
          with no reason to each claim a full row of vertical space. Each
          gets its own bordered, tinted box (one of this app's chart hues,
          same convention as the header's Sale/Purchase buttons) so the
          three don't blur into one long strip and each stays easy to find
          at a glance. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-2 rounded-lg border border-[color-mix(in_oklab,var(--chart-2)_35%,transparent)] bg-[color-mix(in_oklab,var(--chart-2)_6%,transparent)] p-4 transition-colors focus-within:bg-[color-mix(in_oklab,var(--chart-2)_12%,transparent)]">
          <PercentOrFlatInput
            base={subtotal + makingChargesTotal + stoneChargesTotal}
            value={discount}
            onChange={setDiscount}
          />
          {!editInvoiceId && (
            <div className="space-y-1.5 border-t pt-2" data-testid="promo-box">
              <Label className="text-xs">Offer / voucher code</Label>
              {appliedPromotion ? (
                <div className="space-y-1 rounded-md border border-emerald-600/30 bg-emerald-600/10 p-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-emerald-800">
                      {appliedPromotion.code} · {appliedPromotion.promotion.name}
                    </span>
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:underline"
                      onClick={() => {
                        setAppliedPromotion(null)
                        setPromoCodeInput("")
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  <p className="text-xs text-emerald-700">
                    {describePromotion(appliedPromotion.promotion)}
                    {promoResult?.ok ? ` — saving ₹${promoTotal.toFixed(2)}` : ""}
                  </p>
                  {promoResult && !promoResult.ok ? <p className="text-xs text-amber-700">{promoResult.reason}</p> : null}
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <Input
                    value={promoCodeInput}
                    onChange={(event) => setPromoCodeInput(event.target.value.toUpperCase())}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault()
                        void applyPromotionCode()
                      }
                    }}
                    placeholder="e.g. DIWALI10"
                    className="h-9 uppercase"
                    aria-label="Offer or voucher code"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9"
                    disabled={promoChecking || !promoCodeInput.trim()}
                    onClick={() => void applyPromotionCode()}
                  >
                    {promoChecking ? "Checking…" : "Apply"}
                  </Button>
                </div>
              )}
              {promoError ? <p className="text-xs text-destructive">{promoError}</p> : null}
              <input type="hidden" name="promotionCode" value={promoResult?.ok ? appliedPromotion?.code ?? "" : ""} />
            </div>
          )}
        </div>

        {editInvoiceId ? (
          <div className="space-y-2 rounded-lg border border-[color-mix(in_oklab,var(--chart-3)_35%,transparent)] bg-[color-mix(in_oklab,var(--chart-3)_6%,transparent)] p-4 transition-colors focus-within:bg-[color-mix(in_oklab,var(--chart-3)_12%,transparent)]">
            <Label>Paid Now</Label>
            <Input
              type="number"
              step="0.01"
              value={legacyPaidAmount === 0 ? "" : legacyPaidAmount}
              onChange={(e) => setLegacyPaidAmount(Number(e.target.value) || 0)}
            />
          </div>
        ) : (
          <div className="rounded-lg border border-[color-mix(in_oklab,var(--chart-3)_35%,transparent)] bg-[color-mix(in_oklab,var(--chart-3)_6%,transparent)] p-4 transition-colors focus-within:bg-[color-mix(in_oklab,var(--chart-3)_12%,transparent)] space-y-3">
            {/* Store credit — a prior Credit Note or overpayment already
                sitting on this customer's own ledger balance, drawn down
                against this invoice instead of collecting new cash. Only
                shown once one is actually selected and genuinely has
                something available (see customerCredit's own effect). */}
            {customerCredit > 0 && (
              <div className="rounded-md border border-emerald-600/30 bg-emerald-600/10 p-2.5 text-sm">
                {creditApplied > 0 ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-emerald-800">Credit Applied</span>
                      <button
                        type="button"
                        onClick={() => setCreditApplied(0)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      max={Math.min(customerCredit, totalAmount)}
                      value={creditApplied}
                      onChange={(e) =>
                        setCreditApplied(
                          Math.min(Math.max(0, Number(e.target.value) || 0), customerCredit, totalAmount),
                        )
                      }
                      className="h-9"
                    />
                    <p className="text-xs text-emerald-700">
                      Up to ₹{customerCredit.toFixed(2)} available.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-emerald-800">
                      This customer has <span className="font-semibold">₹{customerCredit.toFixed(2)}</span> credit available.
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0 border-emerald-600/40 text-emerald-800 hover:bg-emerald-600/10"
                      onClick={() => setCreditApplied(Math.min(customerCredit, totalAmount))}
                    >
                      Apply Credit
                    </Button>
                  </div>
                )}
              </div>
            )}
            <PaidNowFields
              rows={paymentRows}
              onRowsChange={setPaymentRows}
              maxAmount={totalAmount > 0 ? Math.max(0, totalAmount - creditApplied - oldGoldSplit.applied) : undefined}
            />
            <input type="hidden" name="creditApplied" value={creditApplied} />
          </div>
        )}

        <div className="space-y-2 rounded-lg border border-[color-mix(in_oklab,var(--chart-1)_35%,transparent)] bg-[color-mix(in_oklab,var(--chart-1)_6%,transparent)] p-4 transition-colors focus-within:bg-[color-mix(in_oklab,var(--chart-1)_12%,transparent)]">
          <Label>Notes</Label>
          <Textarea name="notes" rows={2} defaultValue={defaultNotes} />
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 space-y-1 text-sm">
        <div className="flex justify-between">
          <span>Subtotal (metal value)</span>
          <span>₹{subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Making Charges (incl. HM)</span>
          <span>₹{makingChargesTotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Stone Charges</span>
          <span>₹{stoneChargesTotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Discount</span>
          <span>-₹{discount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Scheme / Discount (line items)</span>
          <span>-₹{schemeDiscountTotal.toFixed(2)}</span>
        </div>
        {promoTotal > 0 && appliedPromotion && (
          <div className="flex justify-between text-emerald-700" data-testid="promo-total">
            <span>Offer ({appliedPromotion.code}) — before GST</span>
            <span>-₹{promoTotal.toFixed(2)}</span>
          </div>
        )}
        {gstBreakdownTotal.isInterState ? (
          <div className="flex justify-between">
            <span>Total IGST</span>
            <span>₹{gstBreakdownTotal.igst.toFixed(2)}</span>
          </div>
        ) : (
          <>
            <div className="flex justify-between">
              <span>Total SGST</span>
              <span>₹{gstBreakdownTotal.sgst.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Total CGST</span>
              <span>₹{gstBreakdownTotal.cgst.toFixed(2)}</span>
            </div>
          </>
        )}
        <div className="flex items-center justify-between gap-3">
          <span>Round Off</span>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.01"
              value={roundOffAmount}
              onChange={(e) => setRoundOffOverride(Number(e.target.value) || 0)}
              className="h-7 w-24 text-right"
            />
            {roundOffOverride !== null && (
              <button
                type="button"
                onClick={() => setRoundOffOverride(null)}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                title="Go back to the automatically-calculated Round Off"
              >
                Auto
              </button>
            )}
          </div>
        </div>
        <div className="flex justify-between font-semibold text-base border-t pt-2 mt-2">
          <span>Total</span>
          <span>₹{totalAmount.toFixed(2)}</span>
        </div>
        {creditApplied > 0 && (
          <div className="flex justify-between text-emerald-700">
            <span>Credit Applied</span>
            <span>-₹{creditApplied.toFixed(2)}</span>
          </div>
        )}
        {oldGoldValue > 0 && (
          <>
            <div className="flex justify-between text-amber-700" data-testid="old-gold-applied">
              <span>Less: Bought from customer (value ₹{oldGoldValue.toFixed(2)})</span>
              <span>-₹{oldGoldSplit.applied.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-semibold" data-testid="net-payable">
              <span>Net Payable by Customer</span>
              <span>₹{Math.max(0, totalAmount - creditApplied - oldGoldSplit.applied).toFixed(2)}</span>
            </div>
            {oldGoldSplit.excess > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>
                  {oldGoldExcessMode === "PAID_OUT" ? "Balance paid to customer" : "Balance kept as store credit"}
                </span>
                <span>₹{oldGoldSplit.excess.toFixed(2)}</span>
              </div>
            )}
          </>
        )}
        <div className="flex justify-between text-red-600 font-medium">
          <span>Balance Due</span>
          <span>₹{balanceAmount.toFixed(2)}</span>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={pending || !customerId || hasInvalidStockLink || hasInvalidRate || paidOverTotal || oldGoldPayoutMissing}
        >
          {editInvoiceId
            ? pending
              ? "Updating..."
              : "Update Changes"
            : pending
              ? "Creating..."
              : "Create Invoice"}
        </Button>
      </div>

      {/* Rendered via Radix's own portal, so being inside <form> in the JSX
          tree doesn't nest them in the actual <form> DOM node — no submit/
          bubbling conflict with either dialog's own Cancel/Add buttons. */}
      <AddCategoryDialog
        open={addCategoryForKey !== null}
        onOpenChange={(open) => {
          if (!open) setAddCategoryForKey(null)
        }}
        onCreated={(category) => {
          setCategories((prev) => [...prev, category])
          if (addCategoryForKey) {
            updateItem(addCategoryForKey, { categoryId: category.id, categoryTypeId: "" })
            setCategoryTypesCache((prev) => ({ ...prev, [category.id]: [] }))
          }
        }}
      />

      {addTypeForKey && (() => {
        const targetItem = items.find((item) => item.key === addTypeForKey)
        if (!targetItem?.categoryId) return null
        return (
          <AddCategoryTypeDialog
            open
            onOpenChange={(open) => {
              if (!open) setAddTypeForKey(null)
            }}
            categoryId={targetItem.categoryId}
            categoryName={categories.find((c) => c.id === targetItem.categoryId)?.name ?? ""}
            onCreated={(type) => {
              setCategoryTypesCache((prev) => ({
                ...prev,
                [type.categoryId]: [...(prev[type.categoryId] ?? []), type],
              }))
              updateItem(targetItem.key, { categoryTypeId: type.id })
            }}
          />
        )
      })()}

      <AddMetalDialog
        open={addMetalForKey !== null}
        onOpenChange={(open) => { if (!open) setAddMetalForKey(null) }}
        isGemstone={false}
        onCreated={(metal) => {
          setMetals((prev) => [...prev, metal])
          if (addMetalForKey) {
            updateItem(addMetalForKey, { metalTypeId: metal.id, purity: "", purityLabel: "" })
            ensureMetalPurities(metal.id)
          }
          setAddMetalForKey(null)
        }}
      />

      {addPurityForKey && (() => {
        const targetItem = items.find((item) => item.key === addPurityForKey)
        if (!targetItem || !targetItem.metalTypeId) return null
        const metalTypeId = targetItem.metalTypeId
        return (
          <AddPurityDialog
            open
            onOpenChange={(open) => { if (!open) setAddPurityForKey(null) }}
            storeMetalId={metalTypeId}
            onCreated={(purity) => {
              setMetalPuritiesCache((prev) => ({
                ...prev,
                [metalTypeId]: [...(prev[metalTypeId] ?? []), purity],
              }))
              const metal = metalById.get(metalTypeId)
              const family = metal ? classifyPurityFamily(metal) : null
              const legacyPurity = matchLegacyPurityType(family, purity.label) ?? ""
              const patch: Partial<LineItem> = { purityLabel: purity.label, purity: legacyPurity }
              if (!targetItem.hmChargeTouched && (purity.isHallmarkable || isHallmarkablePurity(legacyPurity))) {
                patch.hmCharge = hallmarkChargePerPiece
              }
              updateItem(targetItem.key, patch)
              setAddPurityForKey(null)
            }}
          />
        )
      })()}
    </form>
  )
}
