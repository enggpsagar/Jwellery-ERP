"use client"

import { useWeightFormat } from "@/components/providers/weight-settings-provider"
import type { WeightFormat } from "@/lib/weight-calc"
import { useMemo, useState } from "react"
import { Plus } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { SelectSearchInput } from "@/components/ui/select-search-input"

/**
 * Sentinel value for the "Create New Line Item" row — a real SelectItem
 * (not a plain <button> inside SelectContent) for the same reason
 * product-select.tsx's ADD_NEW_VALUE is: Radix owns pointer handling in
 * there and can swallow a bare button's click, and as an item it stays
 * keyboard-reachable. Cannot collide with a record id — those are cuids.
 */
const CREATE_NEW_VALUE = "__create_new_line_item__"

type StockItemBase = {
  id: string
  stockCode: string
  productName: string
  /** The linked Product's own SKU (Product.productCode) — shown alongside
   * the stock code so a merchant can recognize a piece by its structured
   * SKU (e.g. "G22-LR-001") wherever stock gets linked into a sale, not
   * just on the Inventory screens. Optional since a couple of callers'
   * stock queries don't carry it (yet) — the default label just omits it. */
  productCode?: string | null
  /** Grams — shown in the label so two pieces of the same Product (same
   * Product Code and name) can still be told apart. */
  netWeight?: number | null
  /** The linked Product's Category (lib/inventory/stock-option-details.ts)
   * — shown in the label and searchable, so a piece's category is visible
   * while picking, not only after. */
  categoryName?: string | null
  /** The linked Product's HSN code — searchable, not shown in the label. */
  productHsnCode?: string | null
}

/**
 * "C-G22-001 — Gold chain · Ornament · 12.200 g (1 Qty)". The Product Code leads, not
 * the internal stock code (STK-…); the stock code stays searchable, and is
 * the fallback only when the stock has no linked Product Code.
 */
function defaultStockLabel(stock: StockItemBase, wf: WeightFormat, availableQty?: number) {
  const code = stock.productCode || stock.stockCode
  const category = stock.categoryName ? ` · ${stock.categoryName}` : ""
  const weight = stock.netWeight != null ? ` · ${wf.grams(stock.netWeight)}` : ""
  const qty = availableQty != null ? ` (${availableQty} Qty)` : ""
  return `${code} — ${stock.productName}${category}${weight}${qty}`
}

type StockItemSelectProps<T extends StockItemBase> = {
  stockItems: T[]
  value: string
  onValueChange: (stockId: string) => void
  /**
   * Picked "Create New Line Item" — the row stays, just unlinked from
   * stock, so the user can fill Item Name/weights/rate by hand. Callers
   * already have this exact behavior via their own applyStockToItem(key, "")
   * (an unmatched id clears the link), so this just wires that in.
   */
  onCreateNew: () => void
  isDisabled?: (stock: T) => boolean
  /** Units of this stock still free to add on this line — shown as "(N Qty)". */
  availableQty?: (stock: T) => number
  renderLabel?: (stock: T) => React.ReactNode
  placeholder?: string
  className?: string
}

/**
 * The one "Link Stock Item" picker used on every document line-item form
 * (Invoice/Kacha/Quotation) — searchable, with a "Create New Line Item"
 * escape hatch always pinned at the top, so a merchant never has to guess
 * that leaving it on its default is how you enter a manual line.
 */
export function StockItemSelect<T extends StockItemBase>({
  stockItems,
  value,
  onValueChange,
  onCreateNew,
  isDisabled,
  availableQty,
  renderLabel,
  placeholder = "Not linked to stock",
  className,
}: StockItemSelectProps<T>) {
  const wf = useWeightFormat()
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return stockItems

    return stockItems.filter(
      (stock) =>
        stock.stockCode.toLowerCase().includes(query) ||
        stock.productName.toLowerCase().includes(query) ||
        (stock.productCode ?? "").toLowerCase().includes(query) ||
        (stock.categoryName ?? "").toLowerCase().includes(query) ||
        (stock.productHsnCode ?? "").toLowerCase().includes(query),
    )
  }, [stockItems, search])

  return (
    <Select
      value={value}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setSearch("")
      }}
      onValueChange={(next) => {
        if (next === CREATE_NEW_VALUE) {
          setOpen(false)
          onCreateNew()
          return
        }
        onValueChange(next)
      }}
    >
      <SelectTrigger className={className ?? "h-11 w-full"}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>

      {/* Opens below the field at a fixed height (it used to grow to the
          whole screen with hundreds of pieces); the search box stays pinned
          at the top while the list scrolls. */}
      <SelectContent position="popper" className="max-h-80">
        <div className="sticky top-0 z-10 bg-popover p-2">
          <SelectSearchInput
            placeholder="Search by product code, name, category or stock code..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}          />
        </div>

        <SelectItem value={CREATE_NEW_VALUE} className="font-medium text-primary">
          <Plus className="mr-1 h-4 w-4" />
          Create New Line Item
        </SelectItem>

        <div className="my-1 border-t" />

        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            No stock items found{search ? ` for "${search}"` : ""}
          </div>
        ) : (
          filtered.map((stock) => (
            <SelectItem key={stock.id} value={stock.id} disabled={isDisabled?.(stock) ?? false}>
              {renderLabel
                ? renderLabel(stock)
                : defaultStockLabel(stock, wf, availableQty?.(stock))}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  )
}
