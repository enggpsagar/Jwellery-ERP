"use client"

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
  renderLabel,
  placeholder = "Not linked to stock",
  className,
}: StockItemSelectProps<T>) {
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return stockItems

    return stockItems.filter(
      (stock) =>
        stock.stockCode.toLowerCase().includes(query) ||
        stock.productName.toLowerCase().includes(query),
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

      <SelectContent>
        <div className="p-2">
          <Input
            placeholder="Search by stock code or product..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
          />
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
              {renderLabel ? renderLabel(stock) : `${stock.stockCode} — ${stock.productName}`}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  )
}
