"use client"

import { LineWastageField } from "@/components/shared/line-wastage-field"
import { deriveNetWeight as calcNetWeight, normalizeWastagePercent, netWeightHint, type WeightSettings } from "@/lib/weight-calc"
import { useWeightSettings } from "@/components/providers/weight-settings-provider"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useActionState } from "react"
import { Coins, Plus, Trash2 } from "lucide-react"
import type { GstScheme, PurityType } from "@prisma/client"

import { createQuotation, type QuotationFormState } from "@/lib/actions/quotation-actions"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/providers/toast-provider"
import { computeGst } from "@/lib/gst"
import { computeRoundOff } from "@/lib/round-off"
import { GstSchemeBadge } from "@/components/shared/gst-scheme-badge"

import { Input } from "@/components/ui/input"
import { LinkedProductDetails } from "@/components/inventory/shared/linked-product-details"
import type { StockOptionProductDetails } from "@/lib/inventory/stock-option-details"
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
import { MakingChargeInput } from "@/components/shared/making-charge-input"
import { PercentOrFlatInput } from "@/components/shared/percent-or-flat-input"
import { LocationSelect, useShowLocationField } from "@/components/shared/location-select"
import { isCaratWeighedMetal, isHallmarkablePurity, resolveGramsPerCarat, resolveStockSellingRate, toPrimaryUnit, matchLegacyPurityType, resolveLegacyPurityLabel } from "@/lib/purity"
import { classifyPurityFamily } from "@/lib/business-units"
import { RequiredMark } from "@/components/shared/required-mark"
import {
  getStoreMetalPurities,
  type StoreMetalRow,
  type StoreMetalOriginRow,
  type StoreMetalPurityRow,
} from "@/lib/actions/taxonomy-actions"
import type { GstRateRow } from "@/lib/actions/gst-rate-actions"
import { StoneComponentFields } from "@/components/inventory/shared/stone-component-fields"
import { StockItemSelect } from "@/components/inventory/shared/stock-item-select"
import { IncludesStoneToggle } from "@/components/ui/includes-stone-toggle"
import { AddMetalDialog } from "@/components/inventory/shared/add-metal-dialog"
import { AddPurityDialog } from "@/components/inventory/shared/add-purity-dialog"
import { PieceComponentsEditor, StoneDetailsInputs } from "@/components/shared/piece-components-editor"
import { stockPieceDrafts, stoneSellingRate, type LinkedStoneDetails } from "@/lib/inventory/stock-pick-rates"
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
import {
  OldGoldExchangeSection,
  emptyOldGoldLine,
  oldGoldLineAmounts,
  serializeOldGoldLine,
} from "@/components/billing/old-gold-exchange-section"
import type { OldGoldLineDraft } from "@/lib/old-gold/value"

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
  metalType: { id: string; name: string } | null
  purity: string | null
  purityLabel: string | null
  grossWeight: number | null
  netWeight: number | null
  caratWeight: number | null
  stoneRate: number | null
  stoneMetalTypeName: string | null
  stoneTypeNames: string | null
  saleRate: number | null
  // See resolveStockSellingRate's own doc comment (lib/purity.ts) — exactly
  // one of these two is ever non-null for a given product (mutually
  // exclusive by StoreMetal.isGemstone).
  storeMetalPurityRate: number | null
  stoneOriginRate: number | null
  /** A piece made of several metals/stones — its rows (lib/piece-components.ts). */
  components?: StoredPieceComponent[]
  /** A single stone's pieces / clarity / certificate / catalog rate. */
  linkedStone?: LinkedStoneDetails | null
} & StockOptionProductDetails

type LineItem = {
  key: string
  /** Wastage / touch % (Settings > Weights) — the purity's default on
   *  pick, editable; undefined = not set (the server applies the default). */
  wastagePercent?: number | null
  itemName: string
  metalTypeId: string
  purity: string
  purityLabel: string
  quantity: number
  grossWeight: number
  /** Always in grams internally, regardless of netWeightUnit — that unit
   * only picks what's displayed/typed (converted via toPrimaryUnit on the
   * way in and out) and what unit this line's weights are persisted in at
   * submit. Same convention for stoneWeightInput below. No Gross/Dmo Weight
   * field on this model, unlike Invoice/Purchase/Kacha. */
  netWeight: number
  netWeightUnit: "GRAM" | "CARAT"
  caratWeight: number
  rate: number
  makingCharge: number
  makingChargeType: "FIXED" | "PERCENTAGE"
  stoneCharge: number
  stoneRate: number
  hasStoneComponent: boolean
  stoneChargeTouched: boolean
  /** Once Net Stone Weight is edited directly, the Stone Carat Weight ->
   * Net Stone Weight auto-fill (see handleCaratWeightChange) stops
   * overwriting it — same escape hatch as stoneChargeTouched. */
  netStoneWeightTouched: boolean
  stoneMetalTypeName: string
  stoneTypeNames: string[]
  /** The single stone's pcs / clarity / certificate (saved on the line's
   * stonePieces / stoneClarity / stoneCertificateNumber). */
  stonePieces?: number | null
  stoneClarity?: string | null
  stoneCertificateNumber?: string | null
  /** Always in grams internally — see netWeightUnit's doc comment above. */
  stoneWeightInput: number
  stoneWeightUnit: "GRAM" | "CARAT"
  hmCharge: number
  /** Once HM Charge is edited directly, the Purity -> HM Charge auto-fill
   * (Settings' per-piece BIS hallmark rate, applied on Gold/Silver purities
   * only — see isHallmarkablePurity) stops overwriting it — same escape
   * hatch as stoneChargeTouched/netStoneWeightTouched. */
  hmChargeTouched: boolean
  inventoryStockId: string
  /** "Purchased From" — who a hand-typed line's piece came in from.
   * Required on a line with no linked stock (see resolveLineSourceParties). */
  sourcePartyId: string
  /** A piece made of several metals and stones (Gold + Silver + Diamond…):
   * its value, weights and GST come from `components`, one row per metal /
   * stone, each with its own rate and GST rate (lib/piece-components.ts).
   * The line's own metal/purity/weights are kept in sync from them. Same
   * as invoice-form.tsx's LineItem. */
  multiPart: boolean
  components: PieceComponentDraft[]
}

// `key` defaults to a fresh UUID for every "Add Item" click (client-only,
// safe to randomize), but the very first row is seeded once from
// useState's initializer, which runs during SSR *and* again on the
// client's first render — two different crypto.randomUUID() values for
// the same row caused a hydration mismatch on every line-item form. The
// initial call passes a fixed key instead so server and client agree.
function emptyLineItem(key: string = crypto.randomUUID()): LineItem {
  return {
    key,
    itemName: "",
    metalTypeId: "",
    purity: "",
    purityLabel: "",
    quantity: 1,
    grossWeight: 0,
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
    stoneWeightInput: 0,
    stoneWeightUnit: "GRAM",
    hmCharge: 0,
    hmChargeTouched: false,
    inventoryStockId: "",
    sourcePartyId: "",
    multiPart: false,
    components: [],
  }
}

const initialState: QuotationFormState = { success: false, message: "" }

/**
 * Where an in-progress quotation is parked while the user is away creating a
 * new party via CustomerSelect's "+" — sessionStorage (not localStorage) so
 * it dies with the tab and can never resurrect a stale draft days later.
 * Mirrors DraftOrderForm's own DRAFT_KEY/DraftOrderDraft.
 */
const DRAFT_KEY = "quotation-form-draft"

const RETURN_TO = "/quotations/new"

type QuotationDraft = {
  customerId: string
  locationId: string
  items: LineItem[]
  discount: number
  gstRateId: string
  quotationDate: string
  validUntil: string
  notes: string
  /** Customer Exchange estimate lines (optional — older drafts lack it). */
  exchangeLines?: OldGoldLineDraft[]
}

type LocationOption = {
  id: string
  name: string
}

type QuotationFormProps = {
  customers: CustomerOption[]
  stockItems: StockOption[]
  locations?: LocationOption[]
  /** Store's default location (Settings > Locations), pre-filled into the
   * Location field on this create form only — never overrides a value
   * already resolved some other way (there is none today for Quotation's
   * Location field, unlike e.g. a restricted single-location Staff auto-pick
   * elsewhere in the app). */
  defaultLocationId?: string | null
  metals: StoreMetalRow[]
  origins: StoreMetalOriginRow[]
  caratConversionRates: Record<PurityType, number>
  /** The store's configured GST rates (Settings > GST Rates) — see the
   * same prop on InvoiceForm for the full explanation. */
  gstRates: GstRateRow[]
  /** Legacy last-resort fallback (BusinessSettings.defaultGstRate) — see
   * the same prop on InvoiceForm. */
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
   * to tell an inter-state quote (IGST) from an intra-state one (SGST+CGST). */
  storeState?: string | null
  /** "Purchased From" options — getSupplierOptions(): Suppliers only when
   * the Supplier module is on, every party when it's off. */
  suppliers?: SourcePartyOption[]
  supplierModuleEnabled?: boolean
  /** Fineness % per legacy purity (getFinenessMap) — the multi-part editor's
   * pure-weight display. */
  enumFineness?: Record<string, number>
  /** Today's fine rates (Metal Rates: gold24k / silver) — prefill a
   * Customer Exchange estimate line's rate, same as New Invoice. */
  fineRates?: { gold: number | null; silver: number | null }
  /** Settings → Stone Clarity names, suggested on every stone's Clarity. */
  clarities?: string[]
}

export function QuotationForm({
  customers,
  stockItems,
  locations = [],
  defaultLocationId = null,
  metals: initialMetals,
  origins: initialOrigins,
  caratConversionRates,
  gstRates,
  defaultGstRate = 0,
  hallmarkChargePerPiece = 0,
  gstScheme,
  storeState,
  suppliers = [],
  supplierModuleEnabled = false,
  enumFineness = {},
  fineRates = { gold: null, silver: null },
  clarities = [],
}: QuotationFormProps) {
  const weightSettings = useWeightSettings()
  // Every hand-typed line needs its source party — see sourcePartyId.
  const missingSourceParty = (lines: LineItem[]) =>
    lines.some((line) => !line.inventoryStockId && !line.sourcePartyId)
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
  const metalById = useMemo(() => new Map(metals.map((m) => [m.id, m])), [metals])

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

  // Backfills a legacy-only stock item's Purity label once its metal's real
  // Purity options load — see resolveLegacyPurityLabel's own doc comment.
  useEffect(() => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.purityLabel || !item.purity || !item.metalTypeId) return item
        const match = resolveLegacyPurityLabel(item.purity, metalPuritiesCache[item.metalTypeId] ?? [])
        return match ? { ...item, purityLabel: match.label } : item
      }),
    )
  }, [metalPuritiesCache])

  // Selecting a real Purity updates purityLabel (the true value), keeps the
  // legacy `purity` enum in sync (matchLegacyPurityType) purely so anything
  // not yet reading purityLabel still shows something, and auto-fills HM
  // Charge from the chosen purity's own isHallmarkable flag (falls back to
  // the legacy isHallmarkablePurity check for a linked-stock line).
  const selectPurity = (item: LineItem, storeMetalPurityId: string) => {
    const options = metalPuritiesCache[item.metalTypeId] ?? []
    const selected = options.find((option) => option.id === storeMetalPurityId)
    const metal = metalById.get(item.metalTypeId)
    const family = metal ? classifyPurityFamily(metal) : null
    const legacyPurity = matchLegacyPurityType(family, selected?.label) ?? ""
    const patch: Partial<LineItem> = {
      purityLabel: selected?.label ?? "",
      purity: legacyPurity,
      wastagePercent: normalizeWastagePercent(selected?.wastagePercent),
    }
    if (!item.hmChargeTouched && (selected?.isHallmarkable || isHallmarkablePurity(legacyPurity))) {
      patch.hmCharge = hallmarkChargePerPiece
    }
    updateItem(item.key, patch)
  }
  // The line's own metal's configured Primary Unit (Settings > Taxonomy) —
  // what Net Weight/Stone Weight are actually persisted in at submit,
  // regardless of what unit is currently toggled for display/entry.
  const primaryUnitFor = (item: LineItem) => metalById.get(item.metalTypeId)?.primaryUnit ?? "GRAM"

  const [customerId, setCustomerId] = useState("")
  // Seeded from the store's default location (create form only) — matches
  // LocationSelect's own useState(defaultValue)-on-first-render init, so
  // this must already be resolved by the time this component first renders,
  // not set later via an effect.
  const [locationId, setLocationId] = useState(defaultLocationId ?? "")
  // CustomerSelect/LocationSelect both seed their own selection from
  // `defaultValue` into internal state, so changing that prop alone will
  // not move them once a restored value needs to show.
  const [customerSelectKey, setCustomerSelectKey] = useState(0)
  const [locationSelectKey, setLocationSelectKey] = useState(0)
  const [items, setItems] = useState<LineItem[]>([emptyLineItem("initial")])
  const [discount, setDiscount] = useState(0)
  // Customer Exchange ESTIMATE — what the customer says they'll trade in.
  // A quotation buys nothing: these are only stored as an estimate
  // (Quotation.exchangeEstimate) and become a real exchange only when the
  // quotation is converted to an invoice (convert-to-invoice-form.tsx).
  const [exchangeLines, setExchangeLines] = useState<OldGoldLineDraft[]>([])
  // A Composition-scheme store can never charge GST — so no rate is
  // selected at all regardless of the store's configured GST Rates.
  const [gstRateId, setGstRateId] = useState<string>(() => {
    if (gstScheme === "COMPOSITION") return ""
    return (
      gstRates.find((r) => r.isDefault && r.isActive)?.id ??
      gstRates.find((r) => r.isActive)?.id ??
      ""
    )
  })
  const availableGstRates = useMemo(
    () => gstRates.filter((r) => r.isActive || r.id === gstRateId),
    [gstRates, gstRateId],
  )
  const selectedGstRate = gstRates.find((r) => r.id === gstRateId)
  // The plain percent, still fed into computeGst() exactly as before — only
  // where the number comes from changed.
  const gstRate =
    gstScheme === "COMPOSITION" ? 0 : (selectedGstRate?.ratePercent ?? defaultGstRate)

  const selectedCustomer = customers.find((customer) => customer.id === customerId)

  const [state, formAction, pending] = useActionState(
    createQuotation,
    initialState,
  )

  useEffect(() => {
    if (state.success && state.quotationId) {
      toast.success(state.message || "Quotation created")
      router.push(`/quotations/${state.quotationId}`)
    } else if (!state.success && state.message) {
      toast.error(state.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  /**
   * Parks the whole in-progress quotation before we navigate off to create a
   * party. Without this, CustomerSelect's "+" would silently throw away
   * every line item and everything else already typed — see this file's own
   * DRAFT_KEY doc comment.
   *
   * Quotation Date, Valid Until and Notes are uncontrolled inputs, so they
   * are read off the form element rather than from state.
   */
  const saveDraft = () => {
    const formData = formRef.current ? new FormData(formRef.current) : null

    const draft: QuotationDraft = {
      customerId,
      locationId,
      items,
      discount,
      gstRateId,
      quotationDate: formData ? String(formData.get("quotationDate") ?? "") : "",
      validUntil: formData ? String(formData.get("validUntil") ?? "") : "",
      notes: formData ? String(formData.get("notes") ?? "") : "",
      exchangeLines,
    }

    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {
      // A full or blocked sessionStorage shouldn't stop the user getting to
      // the create page — they just lose the draft, same as before.
    }
  }

  // Restore-on-return. Runs once: reads any parked draft, then selects the
  // party that was just created. Deliberately not dependent on
  // searchParams — re-running after the URL is cleaned would wipe edits
  // made since. Mirrors DraftOrderForm's own restore effect.
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

    let draft: QuotationDraft | null = null
    if (raw) {
      try {
        draft = JSON.parse(raw) as QuotationDraft
      } catch {
        draft = null
      }
    }

    if (draft) {
      const nextItems = draft.items && draft.items.length ? draft.items : [emptyLineItem()]

      setCustomerId(newCustomerId || draft.customerId || "")
      setItems(nextItems)
      setLocationId(draft.locationId ?? "")
      setDiscount(draft.discount ?? 0)
      if (draft.exchangeLines?.length) setExchangeLines(draft.exchangeLines)
      if (draft.gstRateId) setGstRateId(draft.gstRateId)

      if (formRef.current) {
        const quotationDateInput = formRef.current.elements.namedItem(
          "quotationDate",
        ) as HTMLInputElement | null
        if (quotationDateInput && draft.quotationDate) quotationDateInput.value = draft.quotationDate

        const validUntilInput = formRef.current.elements.namedItem(
          "validUntil",
        ) as HTMLInputElement | null
        if (validUntilInput && draft.validUntil) validUntilInput.value = draft.validUntil

        const notesInput = formRef.current.elements.namedItem(
          "notes",
        ) as HTMLTextAreaElement | null
        if (notesInput && draft.notes) notesInput.value = draft.notes
      }

      // Purity options for each restored line's metal need loading too — a
      // line restored with a metalTypeId already picked would otherwise
      // show an empty Purity dropdown until something else happens to
      // trigger a fetch. Mirrors ReceiveItemsForm's own restore effect.
      const uniqueMetalTypeIds = Array.from(
        new Set([
          ...nextItems.map((item) => item.metalTypeId),
          ...(draft.exchangeLines ?? []).map((line) => line.metalTypeId),
        ].filter(Boolean)),
      )
      for (const id of uniqueMetalTypeIds) ensureMetalPurities(id)

      // Both pickers seed their selection from `defaultValue` into internal
      // state, so a restored value only shows once they remount.
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
      window.history.replaceState({}, "", RETURN_TO)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateItem = (key: string, patch: Partial<LineItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    )
  }

  // Auto-fills HM Charge to the store's configured per-piece BIS hallmark
  // rate the moment a line's Purity becomes a Gold/Silver value — never for
  const handleHmChargeChange = (item: LineItem, value: string) => {
    updateItem(item.key, { hmCharge: Number(value) || 0, hmChargeTouched: true })
  }

  const applyStockToItem = (key: string, stockId: string) => {
    const stock = stockItems.find((s) => s.id === stockId)
    if (!stock) {
      updateItem(key, { inventoryStockId: "" })
      return
    }

    if (stock.metalType?.id) ensureMetalPurities(stock.metalType.id)
    // Already stored in the metal's own configured primary unit — this just
    // picks which unit the toggle starts on, not a value conversion.
    const linkedUnit = metalById.get(stock.metalType?.id ?? "")?.primaryUnit ?? "GRAM"

    const linkedStoneRate = stoneSellingRate(
      {
        name: stock.stoneMetalTypeName,
        types: stock.stoneTypeNames,
        ownRate: stock.stoneRate ?? stock.linkedStone?.catalogRate,
      },
      metals,
      origins,
    )
    // A piece has a stone when its stock row or its Product says so — not
    // only when a stone rate was recorded (same rule as invoice-form.tsx).
    const linkedHasStone =
      stock.stoneRate != null ||
      (stock.caratWeight ?? 0) > 0 ||
      Boolean(stock.stoneMetalTypeName) ||
      stock.productHasStone
    const linkedStoneCharge =
      linkedStoneRate > 0 && (stock.caratWeight ?? 0) > 0
        ? Number((linkedStoneRate * (stock.caratWeight ?? 0)).toFixed(2))
        : 0

    // A multi-metal / multi-stone piece (its own rows, else its Product's —
    // lib/inventory/stock-piece-rows.ts) brings every row; physical facts
    // locked, priced at today's rates (lib/inventory/stock-pick-rates.ts).
    const linkedPieceFields: Partial<LineItem> = (() => {
      if (!stock.components?.length) return { multiPart: false, components: [] }
      const rows = stockPieceDrafts(stock.components, { metals, origins, fineRates })
      const firstMetal = rows.find((row) => row.kind === "METAL")
      const totals = pieceTotals(rows, { valuation: "net" })
      return {
        multiPart: true,
        components: rows,
        metalTypeId: firstMetal?.kind === "METAL" ? firstMetal.metalTypeId : stock.metalType?.id ?? "",
        purity: firstMetal?.kind === "METAL" ? firstMetal.purity : stock.purity ?? "",
        purityLabel: firstMetal?.kind === "METAL" ? firstMetal.purityLabel : stock.purityLabel || stock.productPurityLabel || "",
        netWeight: totals.metalNet,
        grossWeight: stock.grossWeight ?? (totals.metalGross + totals.stoneGrams || totals.metalNet),
        hasStoneComponent: false,
        stoneCharge: 0,
        stoneRate: 0,
        caratWeight: 0,
        stoneMetalTypeName: "",
        stoneTypeNames: [],
      }
    })()

    updateItem(key, {
      inventoryStockId: stockId,
      itemName: stock.productName,
      metalTypeId: stock.metalType?.id ?? "",
      purity: stock.purity ?? "",
      // The Product's own per-Metal Purity fills a stock row that never
      // recorded one — see lib/inventory/stock-option-details.ts.
      purityLabel: stock.purityLabel || stock.productPurityLabel || "",
      grossWeight: stock.grossWeight ?? 0,
      netWeight: stock.netWeight ?? 0,
      netWeightUnit: linkedUnit,
      stoneWeightUnit: linkedUnit,
      // See resolveStockSellingRate's own doc comment (lib/purity.ts) — the
      // store's own configured per-Purity/per-Stone-Type Selling Price
      // (Settings > Taxonomy) now wins over the legacy metal-level fallback.
      rate: resolveStockSellingRate(stock, metalById.get(stock.metalType?.id ?? "")?.sellingPrice),
      caratWeight: stock.caratWeight ?? 0,
      // The piece's / Product's own stone rate, else the Stone Type's
      // Selling Price, else the stone's — so Stone Charge fills in.
      stoneRate: linkedStoneRate,
      // A multi-part piece's stones are rows of their own (components
      // below), never the single-stone fields.
      hasStoneComponent: linkedHasStone,
      stoneCharge: linkedStoneCharge,
      stoneChargeTouched: false,
      stoneMetalTypeName: stock.stoneMetalTypeName ?? "",
      stoneTypeNames: stock.stoneTypeNames
        ? stock.stoneTypeNames.split(",").map((name) => name.trim()).filter(Boolean)
        : [],
      // The stone's pcs / clarity / certificate — its Product's stone row.
      stonePieces: stock.linkedStone?.pieces ?? null,
      stoneClarity: stock.linkedStone?.clarity ?? null,
      stoneCertificateNumber: stock.linkedStone?.certificateNumber ?? null,
      // InventoryStock carries no hmCharge of its own — nothing
      // authoritative to protect, so this stays untouched and lets the
      // Purity-driven auto-fill populate it instead of locking in a stale 0.
      hmCharge: isHallmarkablePurity(stock.purity) ? hallmarkChargePerPiece : 0,
      hmChargeTouched: false,
      makingCharge: stock.defaultMakingCharge ?? 0,
      makingChargeType: stock.defaultMakingChargeType,
      // A multi-metal / multi-stone piece brings its rows; their physical
      // facts are locked, rates start from today's selling prices — same as
      // invoice-form.tsx's applyStockToItem.
      // Last, so a multi-part piece's summary wins — see linkedPieceFields.
      ...linkedPieceFields,
    })
    for (const component of stock.components ?? []) {
      if (component.metalTypeId) ensureMetalPurities(component.metalTypeId)
    }
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
      }
    } else if (item.hasStoneComponent) {
      if (!item.stoneChargeTouched) {
        patch.stoneCharge = Number((item.stoneRate * caratWeight).toFixed(2))
      }

      // Net Stone Weight mirrors Stone Carat Weight until the user edits Net
      // Stone Weight directly (netStoneWeightTouched — same override escape
      // hatch as stoneChargeTouched). stoneWeightInput is always grams
      // internally (see LineItem's own doc comment) — caratWeight is always
      // carats, so this conversion doesn't depend on stoneWeightUnit at all.
      // Unlike Invoice/Purchase/Kacha, a Quotation line has no Gross/Dust
      // weight of its own, so there's no further metal Net Weight to cascade
      // into here.
      if (!item.netStoneWeightTouched) {
        const gramsPerCarat = resolveGramsPerCarat(item.purity, caratConversionRates)
        patch.stoneWeightInput = Number((caratWeight * gramsPerCarat).toFixed(5))
      }
    }

    updateItem(item.key, patch)
  }

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
    updateItem(item.key, {
      stoneWeightInput: toPrimaryUnit(Number(value) || 0, item.stoneWeightUnit, "GRAM", gramsPerCarat),
      netStoneWeightTouched: true,
    })
  }

  // `value` is typed in item.netWeightUnit; netWeight itself always stays
  // grams internally (see LineItem's doc comment).
  const handleNetWeightChange = (item: LineItem, value: string) => {
    const gramsPerCarat = resolveGramsPerCarat(item.purity, caratConversionRates)
    const netWeight = toPrimaryUnit(Number(value) || 0, item.netWeightUnit, "GRAM", gramsPerCarat)
    const patch: Partial<LineItem> = { netWeight }

    if (isCaratLine(item)) {
      patch.caratWeight = Number((netWeight / gramsPerCarat).toFixed(3))
    }

    updateItem(item.key, patch)
  }

  // Diamond items price per carat, not per gram — mirrors lineQuantity in
  // quotation-actions.ts so the live-preview total here never disagrees
  // with what the server actually saves. Stone lines keep pricing off Net
  // Weight (unchanged) — only the Carat Weight field's conversion
  // convenience extends to Stone, not the pricing quantity itself. Net/
  // Carat Weight is per piece, so the priced quantity is that times how
  // many pieces (Qty) — this used to ignore Qty entirely.
  const lineQuantity = (item: LineItem) =>
    (item.purity === "DIAMOND" ? item.caratWeight : item.netWeight) * (item.quantity || 1)

  // A multi-part piece is valued row by row (lib/piece-components.ts);
  // amounts are per piece, so quantity multiplies them.
  const pieceOf = (item: LineItem) => pieceTotals(item.components, { valuation: "net" })
  const lineMetalValue = (item: LineItem) =>
    item.multiPart ? pieceOf(item).metalValue * (item.quantity || 1) : item.rate * lineQuantity(item)
  const lineStoneValue = (item: LineItem) =>
    item.multiPart ? pieceOf(item).stoneValue * (item.quantity || 1) : item.stoneCharge

  const lineTotal = (item: LineItem) =>
    lineMetalValue(item) + item.makingCharge + item.hmCharge + lineStoneValue(item)

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + lineMetalValue(item), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items],
  )
  // Hallmarking charge folds into the quotation's Making Charges total —
  // same convention as invoice-form.tsx's own makingChargesTotal.
  const makingChargesTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.makingCharge + item.hmCharge, 0),
    [items],
  )
  const stoneChargesTotal = useMemo(
    () => items.reduce((sum, item) => sum + lineStoneValue(item), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items],
  )

  // Quotation records tax at the document level, not per line (see
  // Quotation's own schema comment) — one computeGst() call against the
  // whole taxable base, scheme- and inter-state-aware just like Invoice.
  //
  // A multi-part piece's metal/stone rows are the exception: each is taxed
  // at its own GST rate (falling back to the document's), so they come out
  // of the document-rate base and are added row by row — its making/HM
  // stays in the base, same split as invoice-form.tsx's lineGst. With no
  // multi-part line this is exactly the single computeGst() call above.
  const hasMultiPart = items.some((item) => item.multiPart)
  const taxableValue = subtotal + makingChargesTotal + stoneChargesTotal - discount
  const gstBreakdown = useMemo(() => {
    const round = (value: number) => Math.round(value * 100) / 100
    const pieceLines = items.filter((item) => item.multiPart)
    const pieceBase = pieceLines.reduce((sum, item) => sum + lineMetalValue(item) + lineStoneValue(item), 0)
    const breakdown = computeGst(taxableValue - pieceBase, gstRate, gstScheme, storeState, selectedCustomer?.state)
    const split = (taxable: number, percent: number) =>
      computeGst(taxable, gstScheme === "COMPOSITION" ? 0 : percent, gstScheme, storeState, selectedCustomer?.state)
    const rateOf = (id: string) => gstRates.find((r) => r.id === id)?.ratePercent ?? gstRate
    const parts = pieceLines.map((item) =>
      pieceGst(item.components, { valuation: "net" }, item.quantity || 1, rateOf, split),
    )
    return {
      sgst: round(round(breakdown.sgst) + parts.reduce((sum, part) => sum + part.sgst, 0)),
      cgst: round(round(breakdown.cgst) + parts.reduce((sum, part) => sum + part.cgst, 0)),
      igst: round(round(breakdown.igst) + parts.reduce((sum, part) => sum + part.igst, 0)),
      isInterState: breakdown.isInterState,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, taxableValue, gstRate, gstRates, gstScheme, storeState, selectedCustomer?.state])
  const taxAmount = gstBreakdown.sgst + gstBreakdown.cgst + gstBreakdown.igst

  const rawTotal =
    subtotal + makingChargesTotal + stoneChargesTotal - discount + taxAmount
  // Live preview of the same computeRoundOff() the server applies on save
  // (see createQuotation in quotation-actions.ts) — never submitted itself,
  // just shown here so the displayed Total already matches what gets saved.
  const { roundOffAmount, totalAmount } = computeRoundOff(rawTotal)

  // The exchange estimate is shown as a deduction only — the quotation's own
  // Total is unchanged (createQuotation never folds it in).
  const exchangeValue = exchangeLines.reduce(
    (sum, line) =>
      sum +
      oldGoldLineAmounts(
        line,
        metalPuritiesCache[line.metalTypeId],
        enumFineness,
        Boolean(metalById.get(line.metalTypeId)?.isGemstone),
        metalPuritiesCache,
        weightSettings,
      ).total,
    0,
  )
  const exchangeApplied = Math.min(exchangeValue, Math.max(totalAmount, 0))

  const itemsJson = JSON.stringify(
    items.map((item) => {
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
        wastagePercent: item.multiPart || item.wastagePercent === undefined ? undefined : normalizeWastagePercent(item.wastagePercent),
        quantity: item.quantity || 1,
        grossWeight: item.grossWeight || null,
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
        stonePieces: item.hasStoneComponent && !item.multiPart ? item.stonePieces || null : null,
        stoneClarity: item.hasStoneComponent && !item.multiPart ? item.stoneClarity?.trim() || null : null,
        stoneCertificateNumber:
          item.hasStoneComponent && !item.multiPart ? item.stoneCertificateNumber?.trim() || null : null,
        stoneWeight: toUnit(item.stoneWeightInput) || null,
        hmCharge: item.hmCharge,
        inventoryStockId: item.inventoryStockId || null,
        vendorId: item.inventoryStockId ? null : item.sourcePartyId || null,
        multiPart: item.multiPart && item.components.length > 0,
        components: item.multiPart ? toComponentPayload(item.components, { valuation: "net" }) : [],
      }
    }),
  )

  // A multi-part line is only quotable once its rows carry a value — the
  // server refuses a ₹0 piece (resolvePieceLines in quotation-actions.ts).
  const hasUnpricedPiece = items.some((item) => item.multiPart && !(pieceOf(item).total > 0))

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
        formAction(new FormData(event.currentTarget))
      }}
      className="space-y-6"
    >
      <input type="hidden" name="itemsJson" value={itemsJson} />
      <input type="hidden" name="discount" value={discount} />
      <input type="hidden" name="taxAmount" value={taxAmount} />
      <input type="hidden" name="gstRateId" value={gstRateId} />
      <input type="hidden" name="sgstAmount" value={gstBreakdown.sgst} />
      <input type="hidden" name="cgstAmount" value={gstBreakdown.cgst} />
      <input type="hidden" name="igstAmount" value={gstBreakdown.igst} />
      <input
        type="hidden"
        name="exchangeEstimateJson"
        value={JSON.stringify(exchangeLines.map(serializeOldGoldLine))}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2 md:col-span-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Party <RequiredMark /></Label>
          <CustomerSelect
            key={customerSelectKey}
            customers={customers}
            defaultValue={customerId}
            onChange={(id) => setCustomerId(id)}
            onBeforeAddNew={() => saveDraft()}
            name="customerId"
          />
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Quotation Date</Label>
          <Input
            type="date"
            name="quotationDate"
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Valid Until</Label>
          <Input type="date" name="validUntil" />
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          {showLocationField && <Label>Store Location</Label>}
          <LocationSelect
            key={locationSelectKey}
            locations={locations}
            name="locationId"
            defaultValue={locationId}
            onChange={setLocationId}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Line Items</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setItems((prev) => [...prev, emptyLineItem()])}
          >
            <Plus className="h-4 w-4 mr-1" /> Add Item
          </Button>
        </div>

        <div className="space-y-3">
          {items.map((item, index) => {
            // Once a line is linked to a Stock Item, the physical facts
            // about that piece come from Inventory and are locked here,
            // same as Invoice already does — see isLinked there.
            const isLinked = Boolean(item.inventoryStockId)
            const linkedStock = isLinked ? stockItems.find((s) => s.id === item.inventoryStockId) : undefined
            // Multi-part piece: rows drive the line's own metal/purity/weights
            // (first metal; combined net) — same as invoice-form.tsx.
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
              })
            }
            const setMultiPart = (on: boolean) => {
              if (!on) {
                updateItem(item.key, { multiPart: false, components: [] })
                return
              }
              const metalRow = { ...newMetalRow(item.rate, gstRateId), metalTypeId: item.metalTypeId, purity: item.purity, purityLabel: item.purityLabel, grossWeight: item.grossWeight, netWeight: item.netWeight }
              const rows: PieceComponentDraft[] = [metalRow, newMetalRow(0, gstRateId), newStoneRow(gstRateId)]
              updateItem(item.key, {
                multiPart: true,
                hasStoneComponent: false,
                stoneCharge: 0,
                stoneChargeTouched: false,
                stoneWeightInput: 0,
                netStoneWeightTouched: false,
              })
              setComponents(rows)
            }
            const piecesEditor = (
              <div className="rounded-md border border-amber-300 bg-amber-50/60 p-2.5">
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
                  defaultGstRateId={gstRateId}
                  rateForMetal={(metal) => metal.sellingPrice ?? 0}
                  lockPhysical={isLinked}
                  testIdPrefix="quotation-piece"
                  clarities={clarities}
                />
              </div>
            )
            return (
            <div key={item.key} className="rounded-lg border p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2 space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                  <Label className="text-xs">Link Stock Item (optional)</Label>
                  <StockItemSelect
                    stockItems={stockItems}
                    value={item.inventoryStockId}
                    onValueChange={(value) => applyStockToItem(item.key, value)}
                    // See invoice-form.tsx's identical comment — a plain
                    // applyStockToItem(key, "") only clears inventoryStockId,
                    // leaving a previously-linked stock's Item Name/weights/
                    // rate in place, so this resets the whole row instead.
                    onCreateNew={() => updateItem(item.key, { ...emptyLineItem(), key: item.key })}
                  />
                </div>

                <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                  <Label className="text-xs">Item Name</Label>
                  <Input
                    value={item.itemName}
                    onChange={(e) => updateItem(item.key, { itemName: e.target.value })}
                    readOnly={isLinked}
                    className={isLinked ? "bg-muted" : undefined}
                  />
                </div>

                <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                  <Label className="text-xs">Quantity</Label>
                  <Input
                    type="number"
                    min={1}
                    // Empty while genuinely blank mid-edit — forcing it
                    // back to 1 on every keystroke made it impossible to
                    // ever delete/replace that digit.
                    value={item.quantity === 0 ? "" : item.quantity}
                    onChange={(e) =>
                      updateItem(item.key, {
                        quantity: e.target.value === "" ? 0 : Number(e.target.value) || 0,
                      })
                    }
                    onBlur={() => {
                      if (!item.quantity) updateItem(item.key, { quantity: 1 })
                    }}
                  />
                </div>
              </div>

              {/* Category/Type/Style of the picked piece — read-only,
                  same as Invoice's Product details. */}
              {linkedStock && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <LinkedProductDetails
                    categoryName={linkedStock.categoryName}
                    categoryTypeName={linkedStock.categoryTypeName}
                    targetStyleName={linkedStock.targetStyleName}
                    showStyle={false}
                  />
                </div>
              )}

              {/* Where a hand-typed piece (and its metal) came in from —
                  required, so its arrival stays traceable. A linked
                  piece's source is its stock row's own vendor. */}
              {!isLinked && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="col-span-2 space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                    <Label className="text-xs">
                      Purchased From ({supplierModuleEnabled ? "Supplier" : "Party"}) <RequiredMark />
                    </Label>
                    <SourcePartySelect
                      parties={suppliers}
                      value={item.sourcePartyId ?? ""}
                      onChange={(value) => updateItem(item.key, { sourcePartyId: value })}
                      termLabel={supplierModuleEnabled ? "supplier" : "party"}
                    />
                    {!item.sourcePartyId && (
                      <p className="text-[11px] text-destructive">Select who this piece was purchased from</p>
                    )}
                  </div>
                </div>
              )}

              {/* "Made of more than one metal or stone?" — a hand-typed line
                  only; a picked stock piece made of several comes in with
                  its rows already (physical facts locked). */}
              {!isLinked && <MultiPartQuestion checked={item.multiPart} onChange={setMultiPart} />}
              {item.multiPart && piecesEditor}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {!item.multiPart && (
                <>
                <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                  <Label className="text-xs">Metal Type</Label>
                  <div className="flex gap-1.5">
                    <Select
                      value={item.metalTypeId}
                      disabled={isLinked}
                      onValueChange={(value) => {
                        ensureMetalPurities(value)
                        updateItem(item.key, { metalTypeId: value, purity: "", purityLabel: "" })
                      }}
                    >
                      <SelectTrigger className="w-full">
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
                      className="w-9 shrink-0 px-0"
                      aria-label="Add Metal Type"
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
                      <SelectTrigger className="w-full">
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
                      className="w-9 shrink-0 px-0"
                      aria-label="Add Purity"
                      disabled={isLinked || !item.metalTypeId}
                      onClick={() => setAddPurityForKey(item.key)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {!item.multiPart && (
                  <LineWastageField
                    value={item.wastagePercent}
                    onChange={(wastagePercent) => updateItem(item.key, { wastagePercent })}
                    grossWeight={0}
                    netWeight={item.netWeight || 0}
                    finenessPercent={(metalPuritiesCache[item.metalTypeId] ?? []).find((option) => option.label === item.purityLabel)?.finenessPercent ?? null}
                    hasPurity={Boolean(metalById.get(item.metalTypeId)?.hasPurity)}
                  />
                )}
                </>
                )}

                {item.multiPart ? (
                  <div className="space-y-1">
                    <Label className="text-xs">Net Weight</Label>
                    <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm" data-testid="quotation-line-net">
                      {pieceOf(item).metalNet.toFixed(3)} g
                    </div>
                    <p className="text-xs text-muted-foreground">All metals</p>
                  </div>
                ) : (
                <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                  <Label className="text-xs">Net Weight</Label>
                  <div className="flex gap-1">
                    <Input
                      type="number"
                      step="any"
                      className={isLinked ? "flex-1 bg-muted" : "flex-1"}
                      readOnly={isLinked}
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
                      onChange={(e) => handleNetWeightChange(item, e.target.value)}
                    />
                    <Select
                      value={item.netWeightUnit}
                      disabled={isLinked}
                      onValueChange={(unit) => updateItem(item.key, { netWeightUnit: unit as "GRAM" | "CARAT" })}
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

                {/* For a carat-weighed line (no "Includes a Stone" toggle
                    applies there at all — see below), Net Stone Weight has
                    no gating concept and always shows here. For every other
                    line, this field is only ever visible once "Includes a
                    Stone" is checked, inside that toggle's own box below —
                    while off, it stays fully hidden (not shown here) rather
                    than relocated, per the toggle's on/off gating. */}
                {!item.multiPart && isCaratLine(item) && (
                  <div className="space-y-1">
                    <Label className="text-xs">Net Stone Weight</Label>
                    <div className="flex gap-1">
                      <Input
                        type="number"
                        step="any"
                        className={isLinked ? "flex-1 bg-muted" : "flex-1"}
                        readOnly={isLinked}
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
                        onChange={(e) => handleStoneWeightInputChange(item, e.target.value)}
                      />
                      <Select
                        value={item.stoneWeightUnit}
                        disabled={isLinked}
                        onValueChange={(unit) =>
                          updateItem(item.key, { stoneWeightUnit: unit as "GRAM" | "CARAT" })
                        }
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

                {!item.multiPart && isCaratLine(item) && (
                  <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                    <Label className="text-xs">Carat Weight (ct)</Label>
                    <Input
                      type="number"
                      step="any"
                      readOnly={isLinked}
                      className={isLinked ? "bg-muted" : undefined}
                      value={item.caratWeight === 0 ? "" : item.caratWeight}
                      onChange={(e) => handleCaratWeightChange(item, e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {item.purity === "DIAMOND"
                        ? "Priced per carat, not per gram"
                        : "1 ct = 0.2 g — converts with Net Weight"}
                    </p>
                  </div>
                )}

                {item.multiPart ? (
                  <div className="space-y-1">
                    <Label className="text-xs">Rate / g</Label>
                    <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-xs text-muted-foreground">Per metal</div>
                    {!(pieceOf(item).total > 0) && (
                      <p className="text-xs text-destructive">Add rates to the metals/stones</p>
                    )}
                  </div>
                ) : (
                <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                  <Label className="text-xs">Rate / g</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={item.rate === 0 ? "" : item.rate}
                    onChange={(e) =>
                      updateItem(item.key, { rate: Number(e.target.value) || 0 })
                    }
                  />
                </div>
                )}

                <MakingChargeInput
                  // A multi-part piece has no single rate — % making is on
                  // its metals' value (value per gram × net weight).
                  rate={item.multiPart ? (pieceOf(item).metalNet > 0 ? pieceOf(item).metalValue / pieceOf(item).metalNet : 0) : item.rate}
                  netWeight={item.multiPart ? pieceOf(item).metalNet : item.netWeight}
                  value={item.makingCharge}
                  onChange={(v) => updateItem(item.key, { makingCharge: v })}
                  chargeType={item.makingChargeType}
                  onChargeTypeChange={(t) => updateItem(item.key, { makingChargeType: t })}
                />

                {/* For a carat-weighed line (no "Includes a Stone" toggle
                    applies there at all), Stone Charge always shows here.
                    For every other line, it's only ever visible once
                    "Includes a Stone" is checked, inside that toggle's own
                    box below — while off, no stone means nothing to charge
                    for, so it stays fully hidden here. */}
                {!item.multiPart && isCaratLine(item) && (
                  <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                    <Label className="text-xs">Stone Charge</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.stoneCharge === 0 ? "" : item.stoneCharge}
                      onChange={(e) => handleStoneChargeChange(item, e.target.value)}
                    />
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

                <div className="space-y-1">
                  <Label className="text-xs">Line Total</Label>
                  <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm font-medium">
                    ₹{lineTotal(item).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* A composite piece (metal + an embedded stone) is the
                  exception, not the rule, for a line whose own metal isn't
                  Diamond/Stone — kept as its own toggled strip rather than
                  wedged into the grid above, so a plain Gold line's fields
                  don't reflow every time this gets checked/unchecked. */}
              {!item.multiPart && !isCaratLine(item) && (!isLinked || item.hasStoneComponent) && (
                <div
                  className={cn(
                    "flex flex-col gap-3 rounded-md border border-dashed p-3 transition-colors",
                    item.hasStoneComponent && "border-2 border-emerald-400 bg-emerald-50",
                  )}
                >
                  <IncludesStoneToggle
                    checked={item.hasStoneComponent}
                    disabled={isLinked}
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
                      onStoneWeightUnitChange={(unit) => updateItem(item.key, { stoneWeightUnit: unit })}
                      netStoneWeightTouched={item.netStoneWeightTouched}
                      lockPhysicalFields={isLinked}
                    />
                  )}
                  {item.hasStoneComponent && (
                    <StoneDetailsInputs
                      className="mt-2"
                      value={{
                        pieces: item.stonePieces,
                        clarity: item.stoneClarity,
                        certificateNumber: item.stoneCertificateNumber,
                      }}
                      onChange={(patch) =>
                        updateItem(item.key, {
                          ...("pieces" in patch ? { stonePieces: patch.pieces } : {}),
                          ...("clarity" in patch ? { stoneClarity: patch.clarity } : {}),
                          ...("certificateNumber" in patch ? { stoneCertificateNumber: patch.certificateNumber } : {}),
                        })
                      }
                      clarities={clarities}
                      locked={isLinked ? stockItems.find((s) => s.id === item.inventoryStockId)?.linkedStone : undefined}
                      testIdPrefix="quotation-line-stone"
                      index={index}
                    />
                  )}
                </div>
              )}

              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(item.key)}
                  className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline"
                >
                  <Trash2 className="h-3 w-3" /> Remove item
                </button>
              )}
            </div>
            )
          })}
        </div>
      </div>

      {/* Customer Exchange — an ESTIMATE only. Nothing is bought, no stock
          moves and no ledger is posted from a quotation; the shop confirms
          it on conversion, where it becomes a real exchange on the invoice.
          The excess / payout choice is decided there too (excess={0}). */}
      <section className="space-y-3" data-testid="quotation-exchange-estimate">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-amber-500/60 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
              <Coins className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">Customer Exchange — estimate</p>
              <p className="text-xs text-muted-foreground">
                Old gold, silver or diamonds the customer says they&apos;ll trade in. Nothing is bought until the
                quotation is converted to an invoice.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {exchangeLines.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {exchangeLines.length} item{exchangeLines.length === 1 ? "" : "s"} ·{" "}
                <span className="font-semibold text-foreground">₹{exchangeValue.toFixed(2)}</span> (estimate)
              </p>
            )}
            <Button
              type="button"
              onClick={() => setExchangeLines((prev) => [...prev, emptyOldGoldLine()])}
              className="bg-amber-500 text-white shadow-sm hover:bg-amber-600"
            >
              <Plus className="mr-1.5 size-4" />
              Add exchange item
            </Button>
          </div>
        </div>
        <OldGoldExchangeSection
          part="lines"
          clarities={clarities}
          lines={exchangeLines}
          onLinesChange={setExchangeLines}
          metals={metals}
          origins={origins}
          onMetalsChange={setMetals}
          onOriginsChange={setOrigins}
          puritiesByMetal={metalPuritiesCache}
          ensurePurities={ensureMetalPurities}
          enumFineness={enumFineness}
          fineRates={fineRates}
          excess={0}
          excessMode="STORE_CREDIT"
          onExcessModeChange={() => {}}
          payoutMethod=""
          onPayoutMethodChange={() => {}}
          payoutReference=""
          onPayoutReferenceChange={() => {}}
        />
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <PercentOrFlatInput
            base={subtotal + makingChargesTotal + stoneChargesTotal}
            value={discount}
            onChange={setDiscount}
          />
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <div className="flex items-center justify-between">
            <Label>GST Rate</Label>
            <GstSchemeBadge scheme={gstScheme} />
          </div>
          <Select
            value={gstRateId || undefined}
            disabled={gstScheme === "COMPOSITION"}
            onValueChange={(value) => setGstRateId(value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select GST rate" />
            </SelectTrigger>
            <SelectContent>
              {availableGstRates.map((rate) => (
                <SelectItem key={rate.id} value={rate.id}>
                  {rate.name} ({rate.ratePercent}%)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {gstScheme === "COMPOSITION"
              ? "Not used — Composition Scheme never charges GST."
              : gstBreakdown.isInterState
                ? `IGST (inter-state) — total tax ₹${taxAmount.toFixed(2)}`
                : `SGST + CGST (intra-state) — total tax ₹${taxAmount.toFixed(2)}`}
          </p>
        </div>
      </div>

      {gstScheme !== "COMPOSITION" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {gstBreakdown.isInterState ? (
            <div className="space-y-2">
              <Label className="text-xs">IGST{hasMultiPart ? "" : ` (${gstRate.toFixed(2)}%)`}</Label>
              <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
                ₹{gstBreakdown.igst.toFixed(2)}
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-xs">SGST{hasMultiPart ? "" : ` (${(gstRate / 2).toFixed(2)}%)`}</Label>
                <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
                  ₹{gstBreakdown.sgst.toFixed(2)}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">CGST{hasMultiPart ? "" : ` (${(gstRate / 2).toFixed(2)}%)`}</Label>
                <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
                  ₹{gstBreakdown.cgst.toFixed(2)}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
        <Label>Notes</Label>
        <Textarea name="notes" rows={2} />
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
          <span>Tax</span>
          <span>₹{taxAmount.toFixed(2)}</span>
        </div>
        {roundOffAmount !== 0 && (
          <div className="flex justify-between">
            <span>Round Off</span>
            <span>
              {roundOffAmount > 0 ? "+" : "-"}₹{Math.abs(roundOffAmount).toFixed(2)}
            </span>
          </div>
        )}
        <div className="flex justify-between font-semibold text-base border-t pt-2 mt-2">
          <span>Total</span>
          <span>₹{totalAmount.toFixed(2)}</span>
        </div>
        {exchangeValue > 0 && (
          <>
            <div className="flex justify-between text-amber-700" data-testid="quotation-exchange-less">
              <span>Less: old gold (estimate{exchangeValue > exchangeApplied ? `, value ₹${exchangeValue.toFixed(2)}` : ""})</span>
              <span>-₹{exchangeApplied.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-semibold" data-testid="quotation-net-payable">
              <span>Net payable (estimate)</span>
              <span>₹{Math.max(0, totalAmount - exchangeApplied).toFixed(2)}</span>
            </div>
          </>
        )}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !customerId || missingSourceParty(items) || hasUnpricedPiece}>
          {pending ? "Creating..." : "Create Quotation"}
        </Button>
      </div>

      {/* Rendered via Radix's own portal, so being inside <form> in the JSX
          tree doesn't nest them in the actual <form> DOM node — no submit/
          bubbling conflict with either dialog's own Cancel/Add buttons. */}
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
