"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useActionState } from "react"
import { Plus, Trash2 } from "lucide-react"

import { createInvoice, type InvoiceFormState } from "@/lib/actions/invoice-actions"
import { useToast } from "@/components/providers/toast-provider"
import { ScanToAddPanel } from "@/components/billing/scan-to-add-panel"
import { todayForDateInput } from "@/lib/date-input"

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
import { RequiredMark } from "@/components/shared/required-mark"
import { LocationSelect, type LocationOption } from "@/components/shared/location-select"
import { PURITY_SELECT_OPTIONS } from "@/lib/purity"

type CustomerOption = {
  id: string
  name: string
  phone: string | null
  customerCode: string | null
}

type StockOption = {
  id: string
  stockCode: string
  productName: string
  hsnCode: string | null
  metalType: { id: string; name: string } | null
  purity: string | null
  netWeight: number | null
  stoneWeight: number | null
  saleRate: number | null
  quantity: number
}

type LineItem = {
  key: string
  itemName: string
  metalTypeId: string
  purity: string
  quantity: number
  grossWeight: number
  netWeight: number
  caratWeight: number
  rate: number
  makingCharge: number
  makingChargeType: "FIXED" | "PERCENTAGE"
  stoneCharge: number
  dmoWeight: number
  stoneWeight: number
  hmCharge: number
  schemeDiscount: number
  hsnCode: string
  inventoryStockId: string
  /** Once Net Weight is edited directly, the gross/stone/dmo auto-calc
   * stops overwriting it. */
  netTouched: boolean
}

function deriveNetWeight(grossWeight: number, stoneWeight: number, dmoWeight: number) {
  if (!grossWeight) return null
  const net = grossWeight - stoneWeight - dmoWeight
  return net >= 0 ? Number(net.toFixed(3)) : null
}

function emptyLineItem(): LineItem {
  return {
    key: crypto.randomUUID(),
    itemName: "",
    metalTypeId: "",
    purity: "",
    quantity: 1,
    grossWeight: 0,
    netWeight: 0,
    caratWeight: 0,
    rate: 0,
    makingCharge: 0,
    makingChargeType: "FIXED",
    stoneCharge: 0,
    dmoWeight: 0,
    stoneWeight: 0,
    hmCharge: 0,
    schemeDiscount: 0,
    hsnCode: "",
    inventoryStockId: "",
    netTouched: false,
  }
}

const initialState: InvoiceFormState = { success: false, message: "" }

type InvoiceFormProps = {
  customers: CustomerOption[]
  stockItems: StockOption[]
  locations: LocationOption[]
  /** Store's default GST%, split evenly into SGST+CGST per line. Editable
   * here per invoice — a store on an exempt sale, or one that changes its
   * rate mid-year, isn't stuck with whatever Settings says today. */
  defaultGstRate?: number
}

export function InvoiceForm({ customers, stockItems, locations, defaultGstRate = 0 }: InvoiceFormProps) {
  const router = useRouter()
  const toast = useToast()

  const [customerId, setCustomerId] = useState("")
  const [locationId, setLocationId] = useState("")
  const [items, setItems] = useState<LineItem[]>([emptyLineItem()])
  const [discount, setDiscount] = useState(0)
  const [gstRate, setGstRate] = useState(defaultGstRate)
  const [paidAmount, setPaidAmount] = useState(0)

  const [state, formAction, pending] = useActionState(
    createInvoice,
    initialState,
  )

  useEffect(() => {
    if (state.success && state.invoiceId) {
      toast.success(state.message || "Invoice created")
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

    updateItem(key, {
      inventoryStockId: stockId,
      itemName: stock.productName,
      metalTypeId: stock.metalType?.id ?? "",
      purity: stock.purity ?? "",
      netWeight: stock.netWeight ?? 0,
      stoneWeight: stock.stoneWeight ?? 0,
      rate: stock.saleRate ?? 0,
      hsnCode: stock.hsnCode ?? "",
      // The linked stock row's own net weight is authoritative — the
      // gross/stone/dmo calc below must not silently recompute over it.
      netTouched: true,
      // Re-linking to a different stock item resets quantity to a sane
      // default for it (1, or 0 if it's already fully claimed by other
      // lines) rather than carrying over a quantity that made sense for
      // the previous stock item.
      quantity: available > 0 ? 1 : 0,
    })
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
          ...emptyLineItem(),
          inventoryStockId: stock.id,
          itemName: stock.productName,
          metalTypeId: stock.metalType?.id ?? "",
          purity: stock.purity ?? "",
          netWeight: stock.netWeight ?? 0,
          stoneWeight: stock.stoneWeight ?? 0,
          rate: stock.saleRate ?? 0,
          hsnCode: stock.hsnCode ?? "",
          netTouched: true,
        }

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

      setConfirmingClear(false)
      toast.success(`Added ${stock.productName}`)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stockItems],
  )

  // Rows that actually hold something. The form always keeps one blank line
  // to type into, and offering to "remove all" when that is all there is
  // would be offering to do nothing.
  const filledCount = items.filter(
    (item) => item.inventoryStockId || item.itemName.trim(),
  ).length

  const [confirmingClear, setConfirmingClear] = useState(false)

  const clearAllItems = () => {
    setItems([emptyLineItem()])
    setConfirmingClear(false)
  }

  const removeItem = (key: string) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((item) => item.key !== key) : prev))
  }

  // Diamond items price per carat, not per gram — mirrors lineQuantity in
  // invoice-actions.ts so the live-preview total here never disagrees with
  // what the server actually saves.
  const lineQuantity = (item: LineItem) =>
    item.purity === "DIAMOND" ? item.caratWeight : item.netWeight

  // Taxable value per line: metal + making + HM + stone, less any per-line
  // scheme discount — the same base the reference format's SGST/CGST
  // columns are computed against, split evenly since intra-state GST always
  // is.
  const taxableValue = (item: LineItem) =>
    item.rate * lineQuantity(item) +
    item.makingCharge +
    item.hmCharge +
    item.stoneCharge -
    item.schemeDiscount

  const lineGst = (item: LineItem) => {
    const half = Math.round(((taxableValue(item) * gstRate) / 2 / 100) * 100) / 100
    return { sgst: half, cgst: half }
  }

  const lineTotal = (item: LineItem) => {
    const { sgst, cgst } = lineGst(item)
    return taxableValue(item) + sgst + cgst
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
        const { sgst, cgst } = lineGst(item)
        return sum + sgst + cgst
      }, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, gstRate],
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
      const { sgst, cgst } = lineGst(item)
      return {
        itemName: item.itemName || "Item",
        metalTypeId: item.metalTypeId || null,
        purity: item.purity || null,
        quantity: item.quantity || 1,
        grossWeight: item.grossWeight || null,
        netWeight: item.netWeight || null,
        caratWeight: item.caratWeight || null,
        rate: item.rate || null,
        makingCharge: item.makingCharge,
        makingChargeType: item.makingChargeType,
        stoneCharge: item.stoneCharge,
        dmoWeight: item.dmoWeight || null,
        stoneWeight: item.stoneWeight || null,
        hmCharge: item.hmCharge,
        schemeDiscount: item.schemeDiscount,
        sgstAmount: sgst,
        cgstAmount: cgst,
        hsnCode: item.hsnCode || null,
        inventoryStockId: item.inventoryStockId || null,
      }
    }),
  )

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
        formAction(new FormData(event.currentTarget))
      }}
      className="space-y-6"
    >
      <input type="hidden" name="itemsJson" value={itemsJson} />
      <input type="hidden" name="discount" value={discount} />
      <input type="hidden" name="taxAmount" value={taxAmount} />
      <input type="hidden" name="paidAmount" value={paidAmount} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2 md:col-span-2">
          <Label>Customer <RequiredMark /></Label>
          <CustomerSelect
            customers={customers}
            defaultValue={customerId}
            onChange={(id) => setCustomerId(id)}
            name="customerId"
          />
        </div>

        <div className="space-y-2">
          <Label>Invoice Date</Label>
          <Input
            type="date"
            name="invoiceDate"
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </div>

        <div className="space-y-2">
          <Label>Due Date</Label>
          <Input type="date" name="dueDate" min={todayForDateInput()} />
        </div>

        <div className="space-y-2">
          <Label>Location</Label>
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
              onClick={() => setItems((prev) => [...prev, emptyLineItem()])}
            >
              <Plus className="h-4 w-4 mr-1" /> Add Item
            </Button>
          </div>
        </div>

        {/* Above the lines, because it is how the lines get created. */}
        <ScanToAddPanel onScanned={addScannedStock} />

        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.key} className="rounded-lg border p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2 space-y-1">
                  <Label className="text-xs">Link Stock Item (optional)</Label>
                  <Select
                    value={item.inventoryStockId}
                    onValueChange={(value) => applyStockToItem(item.key, value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Not linked to stock" />
                    </SelectTrigger>
                    <SelectContent>
                      {stockItems.map((stock) => {
                        const available = availableForStock(stock.id, item.key)
                        return (
                          <SelectItem key={stock.id} value={stock.id} disabled={available <= 0}>
                            {stock.stockCode} — {stock.productName} ({available} available)
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Item Name</Label>
                  <Input
                    value={item.itemName}
                    onChange={(e) => updateItem(item.key, { itemName: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Quantity</Label>
                  <Input
                    type="number"
                    min={1}
                    max={item.inventoryStockId ? availableForStock(item.inventoryStockId, item.key) : undefined}
                    value={item.quantity}
                    onChange={(e) => {
                      const requested = Number(e.target.value) || 1
                      const quantity = item.inventoryStockId
                        ? Math.min(requested, Math.max(availableForStock(item.inventoryStockId, item.key), 1))
                        : requested
                      updateItem(item.key, { quantity })
                    }}
                  />
                  {item.inventoryStockId && (
                    <p className="text-xs text-muted-foreground">
                      {availableForStock(item.inventoryStockId, item.key)} in stock
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Purity</Label>
                  <Select
                    value={item.purity}
                    onValueChange={(value) => updateItem(item.key, { purity: value })}
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

                <div className="space-y-1">
                  <Label className="text-xs">Gross Weight (g)</Label>
                  <Input
                    type="number"
                    step="0.00001"
                    value={item.grossWeight === 0 ? "" : item.grossWeight}
                    onChange={(e) => {
                      const grossWeight = Number(e.target.value) || 0
                      const derived = item.netTouched
                        ? null
                        : deriveNetWeight(grossWeight, item.stoneWeight, item.dmoWeight)
                      updateItem(item.key, {
                        grossWeight,
                        ...(derived !== null ? { netWeight: derived } : {}),
                      })
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Net Weight (g)</Label>
                  <Input
                    type="number"
                    step="0.00001"
                    value={item.netWeight === 0 ? "" : item.netWeight}
                    onChange={(e) =>
                      updateItem(item.key, {
                        netWeight: Number(e.target.value) || 0,
                        netTouched: true,
                      })
                    }
                  />
                  {!item.netTouched && (
                    <p className="text-xs text-muted-foreground">Gross − stone − dust/other</p>
                  )}
                </div>

                {item.purity === "DIAMOND" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Carat Weight (ct)</Label>
                    <Input
                      type="number"
                      step="0.001"
                      value={item.caratWeight === 0 ? "" : item.caratWeight}
                      onChange={(e) =>
                        updateItem(item.key, { caratWeight: Number(e.target.value) || 0 })
                      }
                    />
                    <p className="text-xs text-muted-foreground">Priced per carat, not per gram</p>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-xs">Dust/Making/Other Wt (g)</Label>
                  <Input
                    type="number"
                    step="0.00001"
                    value={item.dmoWeight === 0 ? "" : item.dmoWeight}
                    onChange={(e) => {
                      const dmoWeight = Number(e.target.value) || 0
                      const derived = item.netTouched
                        ? null
                        : deriveNetWeight(item.grossWeight, item.stoneWeight, dmoWeight)
                      updateItem(item.key, {
                        dmoWeight,
                        ...(derived !== null ? { netWeight: derived } : {}),
                      })
                    }}
                  />
                </div>

                <div className="space-y-1">
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

                <MakingChargeInput
                  rate={item.rate}
                  netWeight={item.netWeight}
                  value={item.makingCharge}
                  onChange={(v) => updateItem(item.key, { makingCharge: v })}
                  chargeType={item.makingChargeType}
                  onChargeTypeChange={(t) => updateItem(item.key, { makingChargeType: t })}
                />

                <div className="space-y-1">
                  <Label className="text-xs">Stone Charge</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={item.stoneCharge === 0 ? "" : item.stoneCharge}
                    onChange={(e) =>
                      updateItem(item.key, {
                        stoneCharge: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Line Total</Label>
                  <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm font-medium">
                    ₹{lineTotal(item).toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">HSN Code</Label>
                  <Input
                    value={item.hsnCode}
                    onChange={(e) => updateItem(item.key, { hsnCode: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Net Stone Weight (ct/g)</Label>
                  <Input
                    type="number"
                    step="0.00001"
                    value={item.stoneWeight === 0 ? "" : item.stoneWeight}
                    onChange={(e) => {
                      const stoneWeight = Number(e.target.value) || 0
                      const derived = item.netTouched
                        ? null
                        : deriveNetWeight(item.grossWeight, stoneWeight, item.dmoWeight)
                      updateItem(item.key, {
                        stoneWeight,
                        ...(derived !== null ? { netWeight: derived } : {}),
                      })
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">HM Charge</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={item.hmCharge === 0 ? "" : item.hmCharge}
                    onChange={(e) =>
                      updateItem(item.key, { hmCharge: Number(e.target.value) || 0 })
                    }
                  />
                </div>

                <div className="space-y-1">
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

                <div className="space-y-1">
                  <Label className="text-xs">SGST ({(gstRate / 2).toFixed(2)}%)</Label>
                  <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
                    ₹{lineGst(item).sgst.toFixed(2)}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">CGST ({(gstRate / 2).toFixed(2)}%)</Label>
                  <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
                    ₹{lineGst(item).cgst.toFixed(2)}
                  </div>
                </div>
              </div>

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
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Discount</Label>
          <Input
            type="number"
            step="0.01"
            value={discount === 0 ? "" : discount}
            onChange={(e) => setDiscount(Number(e.target.value) || 0)}
          />
        </div>

        <div className="space-y-2">
          <Label>GST Rate %</Label>
          <Input
            type="number"
            step="0.01"
            value={gstRate}
            onChange={(e) => setGstRate(Number(e.target.value) || 0)}
          />
          <p className="text-xs text-muted-foreground">
            Split evenly into SGST + CGST per line — total tax ₹{taxAmount.toFixed(2)}
          </p>
        </div>

        <div className="space-y-2">
          <Label>Paid Now</Label>
          <Input
            type="number"
            step="0.01"
            value={paidAmount === 0 ? "" : paidAmount}
            onChange={(e) => setPaidAmount(Number(e.target.value) || 0)}
          />
        </div>
      </div>

      <div className="space-y-2">
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
          <span>Scheme / Discount (line items)</span>
          <span>-₹{schemeDiscountTotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>SGST + CGST</span>
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

      <Button type="submit" disabled={pending || !customerId}>
        {pending ? "Creating..." : "Create Invoice"}
      </Button>
    </form>
  )
}
