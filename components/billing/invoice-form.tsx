"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useActionState } from "react"
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react"
import type { GstScheme, PurityType } from "@prisma/client"

import { createInvoice, updateInvoice, type InvoiceFormState } from "@/lib/actions/invoice-actions"
import { useToast } from "@/components/providers/toast-provider"
import { ScanToAddPanel } from "@/components/billing/scan-to-add-panel"
import { todayForDateInput } from "@/lib/date-input"
import { computeGst } from "@/lib/gst"

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
import { MakingChargeInput } from "@/components/shared/making-charge-input"
import { PercentOrFlatInput } from "@/components/shared/percent-or-flat-input"
import { RequiredMark } from "@/components/shared/required-mark"
import { LocationSelect, type LocationOption } from "@/components/shared/location-select"
import { PaidNowFields } from "@/components/shared/paid-now-fields"
import type { PaymentMethodValue } from "@/components/shared/payment-method-fields"
import { PURITY_SELECT_OPTIONS, isCaratWeighedMetal, isHallmarkablePurity, resolveGramsPerCarat, toPrimaryUnit } from "@/lib/purity"
import type { StoreMetalRow, StoreMetalOriginRow } from "@/lib/actions/taxonomy-actions"
import type { GstRateRow } from "@/lib/actions/gst-rate-actions"
import { StoneComponentFields } from "@/components/inventory/shared/stone-component-fields"
import { StockItemSelect } from "@/components/inventory/shared/stock-item-select"
import { IncludesStoneToggle } from "@/components/ui/includes-stone-toggle"

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
  hsnCode: string | null
  metalType: { id: string; name: string } | null
  purity: string | null
  grossWeight: number | null
  netWeight: number | null
  stoneWeight: number | null
  caratWeight: number | null
  stoneRate: number | null
  stoneMetalTypeName: string | null
  stoneTypeNames: string | null
  saleRate: number | null
  quantity: number
}

export type LineItem = {
  key: string
  itemName: string
  metalTypeId: string
  purity: string
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
}

function deriveNetWeight(grossWeight: number, stoneWeight: number, dmoWeight: number) {
  if (!grossWeight) return null
  const net = grossWeight - stoneWeight - dmoWeight
  return net >= 0 ? Number(net.toFixed(3)) : null
}

function emptyLineItem(defaultGstRateId?: string): LineItem {
  return {
    key: crypto.randomUUID(),
    itemName: "",
    metalTypeId: "",
    purity: "",
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
  }
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
  /** Grams-per-carat per purity (Settings > Purity & Carat > Carat
   * Conversion Rules), resolved via resolveGramsPerCarat() wherever a
   * Carat Weight is converted to/from grams on this form. */
  caratConversionRates: Record<PurityType, number>
  /** Store-configured selling price per Gold/Silver/Platinum purity
   * (Settings > Purity > Metal Selling Rates) — resolved by a line's own
   * `purity` and consulted before falling back to the linked metal's flat
   * StoreMetal.sellingPrice when prefilling a stock-linked line's Rate. */
  metalSellingRates: Partial<Record<PurityType, number>>
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
  /** The store's own state, compared against the selected customer's state
   * to tell an inter-state sale (IGST) from an intra-state one (SGST+CGST). */
  storeState?: string | null
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
}

export function InvoiceForm({
  customers,
  stockItems,
  locations,
  metals: initialMetals,
  origins: initialOrigins,
  caratConversionRates,
  metalSellingRates,
  gstRates,
  initialGstRateId,
  defaultGstRate = 0,
  hallmarkChargePerPiece = 0,
  gstScheme,
  storeState,
  initialCustomerId,
  initialLocationId,
  initialItems,
  replacesId,
  replacesInvoiceNumber,
  editInvoiceId,
  defaultNotes,
}: InvoiceFormProps) {
  const router = useRouter()
  const toast = useToast()
  const [metals, setMetals] = useState(initialMetals)
  const [origins, setOrigins] = useState(initialOrigins)

  const [customerId, setCustomerId] = useState(initialCustomerId ?? "")
  const [locationId, setLocationId] = useState(initialLocationId ?? "")
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
      : [emptyLineItem(resolveDefaultGstRateId())],
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
  const paidAmount = editInvoiceId
    ? legacyPaidAmount
    : paymentRows.reduce((sum, row) => sum + (row.amount || 0), 0)

  const selectedCustomer = customers.find((customer) => customer.id === customerId)

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

  const updateItem = (key: string, patch: Partial<LineItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    )
  }

  // Auto-fills HM Charge to the store's configured per-piece BIS hallmark
  // rate the moment a line's Purity becomes a Gold/Silver value — never for
  // Platinum/Diamond/Other, and never once the user has typed into HM
  // Charge directly (hmChargeTouched). Kept as plain inline logic in the
  // purity-change handler (not a separate useEffect/local component state)
  // so it can't fall into the same "never re-fires on a later-changing
  // dependency" class of bug MakingChargeInput's percent mode had.
  const handlePurityChange = (item: LineItem, purity: string) => {
    const patch: Partial<LineItem> = { purity }
    if (!item.hmChargeTouched && isHallmarkablePurity(purity)) {
      patch.hmCharge = hallmarkChargePerPiece
    }
    updateItem(item.key, patch)
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

  const applyStockToItem = (key: string, stockId: string) => {
    const stock = stockItems.find((s) => s.id === stockId)
    if (!stock) {
      updateItem(key, { inventoryStockId: "" })
      return
    }

    const available = availableForStock(stockId, key)
    // Already stored in the metal's own configured primary unit — this just
    // picks which unit the toggle starts on, not a value conversion.
    const linkedUnit = metalById.get(stock.metalType?.id ?? "")?.primaryUnit ?? "GRAM"

    updateItem(key, {
      inventoryStockId: stockId,
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
      // otherwise the store's configured per-purity Selling Price (Settings
      // > Purity > Metal Selling Rates), then the metal's flat default
      // Selling Price (Settings > Taxonomy) so the field isn't just
      // silently 0 — still fully editable either way, and plain manual
      // entry when none of these are set.
      rate:
        stock.saleRate ??
        metalSellingRates[stock.purity as PurityType] ??
        metalById.get(stock.metalType?.id ?? "")?.sellingPrice ??
        0,
      hsnCode: stock.hsnCode ?? "",
      caratWeight: stock.caratWeight ?? 0,
      stoneRate:
        stock.stoneRate ??
        metalByName.get((stock.stoneMetalTypeName ?? "").toLowerCase())?.sellingPrice ??
        0,
      hasStoneComponent: stock.stoneRate != null,
      stoneCharge: stock.stoneRate != null && stock.caratWeight != null
        ? Number((stock.stoneRate * stock.caratWeight).toFixed(2))
        : 0,
      stoneChargeTouched: false,
      // Only lock the auto-fill when the linked stock row actually has a
      // recorded stone weight worth protecting — a fresh stock item with no
      // stoneWeight set (0/null) has nothing authoritative to preserve, and
      // locking it anyway (unconditional `true`, the previous bug here)
      // permanently blocked Net Stone Weight from ever auto-filling from
      // Stone Carat Weight on that line, even after "Includes a Stone" was
      // just checked and a fresh carat weight typed in.
      netStoneWeightTouched: stock.stoneWeight != null && Number(stock.stoneWeight) > 0,
      stoneMetalTypeName: stock.stoneMetalTypeName ?? "",
      stoneTypeNames: stock.stoneTypeNames
        ? stock.stoneTypeNames.split(",").map((name) => name.trim()).filter(Boolean)
        : [],
      // InventoryStock carries no hmCharge field of its own — there's
      // nothing authoritative here to protect (same reasoning as
      // netStoneWeightTouched above when a stock row has no recorded stone
      // weight), so this stays untouched and lets the Purity-driven
      // auto-fill below populate it instead of locking in a stale 0.
      hmCharge: isHallmarkablePurity(stock.purity) ? hallmarkChargePerPiece : 0,
      hmChargeTouched: false,
      // The linked stock row's own net weight is authoritative — the
      // gross/stone/dmo calc below must not silently recompute over it.
      netTouched: true,
      // Re-linking to a different stock item resets quantity to a sane
      // default for it (1, or 0 if it's already fully claimed by other
      // lines) rather than carrying over a quantity that made sense for
      // the previous stock item.
      quantity: available > 0 ? 1 : 0,
      // InventoryStock carries no GST rate of its own — same reasoning as
      // hmCharge above, so this line starts on the document's current
      // "default for new items" selection rather than blank.
      gstRateId,
    })
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

        // Already stored in the metal's own configured primary unit — this
        // just picks which unit the toggle starts on, not a value conversion.
        const linkedUnit = metalById.get(stock.metalType?.id ?? "")?.primaryUnit ?? "GRAM"

        const scanned: LineItem = {
          ...emptyLineItem(gstRateId),
          inventoryStockId: stock.id,
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
          rate:
            stock.saleRate ??
            metalSellingRates[stock.purity as PurityType] ??
            metalById.get(stock.metalType?.id ?? "")?.sellingPrice ??
            0,
          hsnCode: stock.hsnCode ?? "",
          caratWeight: stock.caratWeight ?? 0,
          stoneRate:
            stock.stoneRate ??
            metalByName.get((stock.stoneMetalTypeName ?? "").toLowerCase())?.sellingPrice ??
            0,
          hasStoneComponent: stock.stoneRate != null,
          stoneCharge: stock.stoneRate != null && stock.caratWeight != null
            ? Number((stock.stoneRate * stock.caratWeight).toFixed(2))
            : 0,
          stoneChargeTouched: false,
          // See applyStockToItem's identical comment above — only lock the
          // auto-fill when this stock row actually has a stone weight worth
          // protecting.
          netStoneWeightTouched: stock.stoneWeight != null && Number(stock.stoneWeight) > 0,
          stoneMetalTypeName: stock.stoneMetalTypeName ?? "",
          stoneTypeNames: stock.stoneTypeNames
            ? stock.stoneTypeNames.split(",").map((name) => name.trim()).filter(Boolean)
            : [],
          // Same reasoning as applyStockToItem — InventoryStock has no
          // hmCharge of its own, so this is left untouched.
          hmCharge: isHallmarkablePurity(stock.purity) ? hallmarkChargePerPiece : 0,
          hmChargeTouched: false,
          netTouched: true,
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

      if (touchedKey) {
        const key = touchedKey
        setExpandedKeys((prev) => new Set(prev).add(key))
      }

      setConfirmingClear(false)
      toast.success(`Added ${stock.productName}`)
    },
    // gstRateId included so a freshly-scanned line always starts on the
    // document's CURRENT default rather than whatever was default when
    // this callback was first created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stockItems, gstRateId],
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
  // Stone components are tracked by name (stoneMetalTypeName), not id — no
  // stoneMetalTypeId field exists — so the stone-rate fallback needs its
  // own name-keyed lookup instead of reusing metalById.
  const metalByName = useMemo(
    () => new Map(metals.map((m) => [m.name.toLowerCase(), m])),
    [metals],
  )
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
  // extends to Stone, not the pricing quantity itself.
  const lineQuantity = (item: LineItem) =>
    item.purity === "DIAMOND" ? item.caratWeight : item.netWeight

  // Taxable value per line: metal + making + HM + stone, less any per-line
  // scheme discount — the same base the reference format's SGST/CGST/IGST
  // columns are computed against.
  const taxableValue = (item: LineItem) =>
    item.rate * lineQuantity(item) +
    item.makingCharge +
    item.hmCharge +
    item.stoneCharge -
    item.schemeDiscount

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
    const breakdown = computeGst(taxableValue(item), lineGstRatePercent(item), gstScheme, storeState, selectedCustomer?.state)
    const round = (value: number) => Math.round(value * 100) / 100
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
    () => items.reduce((sum, item) => sum + item.rate * lineQuantity(item), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items],
  )
  const makingChargesTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.makingCharge + item.hmCharge, 0),
    [items],
  )
  const stoneChargesTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.stoneCharge, 0),
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
    [items, gstRate, gstScheme, storeState, selectedCustomer?.state],
  )
  const totalAmount =
    subtotal +
    makingChargesTotal +
    stoneChargesTotal -
    discount -
    schemeDiscountTotal +
    taxAmount
  const balanceAmount = Math.max(0, totalAmount - paidAmount)

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
        schemeDiscount: item.schemeDiscount,
        sgstAmount: sgst,
        cgstAmount: cgst,
        igstAmount: igst,
        hsnCode: item.hsnCode || null,
        inventoryStockId: item.inventoryStockId || null,
        gstRateId: item.gstRateId || null,
      }
    }),
  )

  // Selling price is mandatory on every line — an invoice with a $0 rate is
  // not a real sale. Checked against every item (not just "filled" ones),
  // matching the server's own guard in createInvoice.
  const hasInvalidRate = items.some((item) => !(item.rate > 0))

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
          <Label>Customer {!editInvoiceId && <RequiredMark />}</Label>
          {editInvoiceId ? (
            // The customer isn't editable here — this changes line items
            // and amounts, not who's billed. Moving an invoice's ledger
            // history to a different customer is a distinct operation
            // nobody asked for. Still posted as a hidden field since
            // customerId is part of the form's shape either way.
            <>
              <input type="hidden" name="customerId" value={customerId} />
              <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm">
                {customers.find((c) => c.id === customerId)?.name ?? "—"}
              </div>
            </>
          ) : (
            <CustomerSelect
              customers={customers}
              defaultValue={customerId}
              onChange={(id) => setCustomerId(id)}
              name="customerId"
            />
          )}
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Invoice Date</Label>
          <Input
            type="date"
            name="invoiceDate"
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Due Date</Label>
          <Input type="date" name="dueDate" min={todayForDateInput()} />
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Store Location</Label>
          <LocationSelect
            locations={locations}
            name="locationId"
            defaultValue={locationId}
            onChange={setLocationId}
          />
        </div>
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

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setItems((prev) => [...prev, emptyLineItem(gstRateId)])}
            >
              <Plus className="h-4 w-4 mr-1" /> Add Item
            </Button>
          </div>
        </div>

        {/* Above the lines, because it is how the lines get created. */}
        <ScanToAddPanel onScanned={addScannedStock} />

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
                  <Input
                    value={item.itemName}
                    readOnly={isLinked}
                    placeholder="Item name"
                    className={isLinked ? "bg-muted" : undefined}
                    onChange={(e) => updateItem(item.key, { itemName: e.target.value })}
                  />
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

                <div className="space-y-1">
                  <div className="flex gap-1">
                    <Input
                      type="number"
                      step="0.00001"
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                      <Label className="text-xs">Link Stock Item (optional)</Label>
                      <StockItemSelect
                        stockItems={stockItems}
                        value={item.inventoryStockId}
                        onValueChange={(value) => applyStockToItem(item.key, value)}
                        // A plain applyStockToItem(key, "") only clears
                        // inventoryStockId — Item Name/weights/rate etc. from
                        // whatever stock was previously linked stayed put, so
                        // picking "Create New Line Item" on an already-linked
                        // row looked like it did nothing. This resets the whole
                        // row to a blank manual-entry line instead, keeping only
                        // its identity (key) so it doesn't jump position.
                        onCreateNew={() => {
                          updateItem(item.key, { ...emptyLineItem(gstRateId), key: item.key })
                          // Back to a blank manual-entry row — collapse it too,
                          // matching a freshly-added line's default state.
                          setExpandedKeys((prev) => {
                            const next = new Set(prev)
                            next.delete(item.key)
                            return next
                          })
                        }}
                        isDisabled={(stock) => availableForStock(stock.id, item.key) <= 0}
                        renderLabel={(stock) =>
                          `${stock.stockCode} — ${stock.productName} (${availableForStock(stock.id, item.key)} available)`
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                      <Label className="text-xs">Purity</Label>
                      <Select
                        value={item.purity}
                        onValueChange={(value) => handlePurityChange(item, value)}
                        disabled={isLinked}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select purity" />
                        </SelectTrigger>
                        <SelectContent>
                          {PURITY_SELECT_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                      <Label className="text-xs">Gross Weight</Label>
                      <div className="flex gap-1">
                        <Input
                          type="number"
                          step="0.00001"
                          className={isLinked ? "flex-1 bg-muted" : "flex-1"}
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

                    {isCaratLine(item) && (
                      <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                        <Label className="text-xs">Carat Weight (ct)</Label>
                        <Input
                          type="number"
                          step="0.001"
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
                      rate={item.rate}
                      netWeight={item.netWeight}
                      value={item.makingCharge}
                      onChange={(v) => updateItem(item.key, { makingCharge: v })}
                      chargeType={item.makingChargeType}
                      onChargeTypeChange={(t) => updateItem(item.key, { makingChargeType: t })}
                    />
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

                  {/* A composite piece (metal + an embedded stone) is the
                      exception, not the rule, for a line whose own metal isn't
                      Diamond/Stone — kept as its own toggled strip rather than
                      wedged into the grid above, so a plain Gold line's fields
                      don't reflow every time this gets checked/unchecked. */}
                  {!isCaratLine(item) && (
                    <div className="flex flex-col gap-3 rounded-md border border-dashed p-3">
                      <IncludesStoneToggle
                        checked={item.hasStoneComponent}
                        onChange={(checked) =>
                          updateItem(item.key, {
                            hasStoneComponent: checked,
                            // Net Stone Weight and Stone Charge are now both
                            // hidden once the toggle is off — clear them so a
                            // hidden field can't silently keep submitting
                            // whatever was last entered.
                            ...(checked
                              ? {}
                              : {
                                  stoneWeightInput: 0,
                                  netStoneWeightTouched: false,
                                  stoneCharge: 0,
                                  stoneChargeTouched: false,
                                }),
                          })
                        }
                        disabled={isLinked}
                      />

                      {item.hasStoneComponent && (
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
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
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
                            step="0.00001"
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

                    {/* Per-line GST Rate — this line's own selection, no
                        document-level picker anymore. Options: active
                        rows, plus this line's own already-selected rate
                        even if it's since been deactivated (edit/replace). */}
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

                    {/* SGST+CGST for an intra-state sale, a single IGST column
                        for inter-state instead — never both, see computeGst()
                        in lib/gst.ts. Composition always lands here at ₹0.00,
                        since computeGst zeroes every component for it. This is
                        the full breakdown — the compact row above shows only
                        the combined total, as a quick summary. Percent shown
                        is THIS line's own resolved rate, not the document
                        default. */}
                    {lineGst(item).isInterState ? (
                      <div className="space-y-1">
                        <Label className="text-xs">IGST ({lineGstRatePercent(item).toFixed(2)}%)</Label>
                        <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
                          ₹{lineGst(item).igst.toFixed(2)}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs">SGST ({(lineGstRatePercent(item) / 2).toFixed(2)}%)</Label>
                          <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
                            ₹{lineGst(item).sgst.toFixed(2)}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">CGST ({(lineGstRatePercent(item) / 2).toFixed(2)}%)</Label>
                          <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
                            ₹{lineGst(item).cgst.toFixed(2)}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
            )
          })}
          </div>
        </div>
      </div>

      <div className="max-w-sm space-y-2">
        <PercentOrFlatInput
          base={subtotal + makingChargesTotal + stoneChargesTotal}
          value={discount}
          onChange={setDiscount}
        />
      </div>

      {editInvoiceId ? (
        <div className="max-w-sm space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Paid Now</Label>
          <Input
            type="number"
            step="0.01"
            value={legacyPaidAmount === 0 ? "" : legacyPaidAmount}
            onChange={(e) => setLegacyPaidAmount(Number(e.target.value) || 0)}
          />
        </div>
      ) : (
        <PaidNowFields
          rows={paymentRows}
          onRowsChange={setPaymentRows}
          maxAmount={totalAmount > 0 ? totalAmount : undefined}
        />
      )}

      <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
        <Label>Notes</Label>
        <Textarea name="notes" rows={2} defaultValue={defaultNotes} />
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
        <div className="flex justify-between">
          <span>GST (SGST+CGST or IGST)</span>
          <span>₹{taxAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-semibold text-base border-t pt-2 mt-2">
          <span>Total</span>
          <span>₹{totalAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-red-600 font-medium">
          <span>Balance Due</span>
          <span>₹{balanceAmount.toFixed(2)}</span>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !customerId || hasInvalidRate || paidOverTotal}>
          {editInvoiceId
            ? pending
              ? "Saving..."
              : "Save Changes"
            : pending
              ? "Creating..."
              : "Create Invoice"}
        </Button>
      </div>
    </form>
  )
}
