"use client"

import { useActionState, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Pencil, X } from "lucide-react"

import { updateInvoiceLineItem, type InvoiceFormState } from "@/lib/actions/invoice-actions"
import { useToast } from "@/components/providers/toast-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export type InvoiceItemRow = {
  id: string
  itemName: string
  quantity: number
  purity: string | null
  netWeight: number | null
  caratWeight: number | null
  rate: number | null
  makingCharge: number
  makingChargeType: string
  stoneCharge: number
  stoneMetalTypeName: string | null
  stoneTypeNames: string | null
  lineTotal: number
}

const initialState: InvoiceFormState = { success: false, message: "" }

/**
 * One row of the invoice item table, read-only by default. `canEdit`
 * gates the Edit icon entirely — only ever true for a DRAFT/PARTIAL
 * invoice (see updateInvoiceLineItem's own status guard, which this
 * mirrors so a stale page can't show an edit control that then fails).
 */
function InvoiceItemRowView({
  invoiceId,
  item,
  canEdit,
  showMaking,
  showStone,
}: {
  invoiceId: string
  item: InvoiceItemRow
  canEdit: boolean
  showMaking: boolean
  showStone: boolean
}) {
  const [editing, setEditing] = useState(false)
  const router = useRouter()
  const toast = useToast()

  const isDiamond = item.purity === "DIAMOND"
  const quantity = isDiamond ? item.caratWeight : item.netWeight

  const [rateInput, setRateInput] = useState(item.rate ? String(item.rate) : "")
  const [weightInput, setWeightInput] = useState(quantity != null ? String(quantity) : "")

  const action = updateInvoiceLineItem.bind(null, invoiceId, item.id)
  const [state, formAction, pending] = useActionState(action, initialState)

  const startEditing = () => {
    setRateInput(item.rate ? String(item.rate) : "")
    setWeightInput(quantity != null ? String(quantity) : "")
    setEditing(true)
  }

  const handleSave = () => {
    const formData = new FormData()
    formData.set("rate", rateInput)
    formData.set("weight", weightInput)
    formAction(formData)
  }

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Line item updated")
      setEditing(false)
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  if (!editing) {
    return (
      <tr className="border-b last:border-0">
        <td className="px-4 py-3">
          {item.itemName}
          {item.stoneMetalTypeName ? (
            <span className="block text-xs text-muted-foreground">
              Stone: {item.stoneMetalTypeName}
              {item.stoneTypeNames ? ` (${item.stoneTypeNames})` : ""}
            </span>
          ) : null}
        </td>
        <td className="px-4 py-3">{item.quantity}</td>
        <td className="px-4 py-3">
          {quantity != null ? `${quantity.toFixed(3)} ${isDiamond ? "ct" : "g"}` : "-"}
        </td>
        <td className="px-4 py-3">{item.rate ? `₹${item.rate.toFixed(2)}` : "-"}</td>
        {showMaking && (
          <td className="px-4 py-3">
            {item.makingCharge > 0 ? (
              <>
                ₹{item.makingCharge.toFixed(2)}
                {item.makingChargeType === "PERCENTAGE" && item.rate && quantity ? (
                  <span className="block text-xs text-muted-foreground">
                    ({((item.makingCharge / (item.rate * quantity)) * 100).toFixed(2)}% of metal value)
                  </span>
                ) : null}
              </>
            ) : (
              "-"
            )}
          </td>
        )}
        {showStone && (
          <td className="px-4 py-3">{item.stoneCharge > 0 ? `₹${item.stoneCharge.toFixed(2)}` : "-"}</td>
        )}
        <td className="px-4 py-3 font-medium">₹{item.lineTotal.toFixed(2)}</td>
        {canEdit && (
          <td className="px-4 py-3 text-right">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Edit rate/weight"
              aria-label={`Edit rate/weight for ${item.itemName}`}
              onClick={startEditing}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </td>
        )}
      </tr>
    )
  }

  return (
    <tr className="border-b bg-accent/30 last:border-0">
      <td className="px-4 py-3">
        {item.itemName}
        {item.stoneMetalTypeName ? (
          <span className="block text-xs text-muted-foreground">
            Stone: {item.stoneMetalTypeName}
            {item.stoneTypeNames ? ` (${item.stoneTypeNames})` : ""}
          </span>
        ) : null}
      </td>
      <td className="px-4 py-3">{item.quantity}</td>
      <td className="px-4 py-3">
        <Input
          type="number"
          step="0.001"
          min="0"
          value={weightInput}
          onChange={(event) => setWeightInput(event.target.value)}
          className="h-9 w-28"
          disabled={pending}
        />
      </td>
      <td className="px-4 py-3">
        <Input
          type="number"
          step="0.01"
          min="0"
          value={rateInput}
          onChange={(event) => setRateInput(event.target.value)}
          className="h-9 w-28"
          disabled={pending}
        />
      </td>
      {showMaking && (
        <td className="px-4 py-3">{item.makingCharge > 0 ? `₹${item.makingCharge.toFixed(2)}` : "-"}</td>
      )}
      {showStone && (
        <td className="px-4 py-3">{item.stoneCharge > 0 ? `₹${item.stoneCharge.toFixed(2)}` : "-"}</td>
      )}
      <td className="px-4 py-3 font-medium">
        {!state.success && state.message ? (
          <span className="text-xs font-normal text-red-600">{state.message}</span>
        ) : (
          `₹${item.lineTotal.toFixed(2)}`
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            size="icon"
            variant="success"
            title="Save"
            aria-label="Save"
            onClick={handleSave}
            disabled={pending}
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            className="bg-slate-800 text-white shadow-sm hover:bg-slate-900"
            title="Cancel"
            aria-label="Cancel"
            onClick={() => setEditing(false)}
            disabled={pending}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  )
}

export function InvoiceItemsTable({
  invoiceId,
  items,
  canEdit,
}: {
  invoiceId: string
  items: InvoiceItemRow[]
  canEdit: boolean
}) {
  // A column with nothing to show across every line item is dead weight,
  // not information — most invoices are metal-only with no making/stone
  // component at all, so this is the common case, not an edge case.
  const showMaking = items.some((item) => item.makingCharge > 0)
  const showStone = items.some((item) => item.stoneCharge > 0)

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/40">
          <tr className="border-b">
            <th className="px-4 py-3 text-left font-medium">Item</th>
            <th className="px-4 py-3 text-left font-medium">Qty</th>
            <th className="px-4 py-3 text-left font-medium">Weight</th>
            <th className="px-4 py-3 text-left font-medium">Rate</th>
            {showMaking && <th className="px-4 py-3 text-left font-medium">Making</th>}
            {showStone && <th className="px-4 py-3 text-left font-medium">Stone</th>}
            <th className="px-4 py-3 text-left font-medium">Line Total</th>
            {canEdit && <th className="px-4 py-3 text-right font-medium">Edit</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <InvoiceItemRowView
              key={item.id}
              invoiceId={invoiceId}
              item={item}
              canEdit={canEdit}
              showMaking={showMaking}
              showStone={showStone}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
