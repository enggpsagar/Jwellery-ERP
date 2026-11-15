"use client"

// Offer / gift-voucher code box for the Estimate and Quotation forms
// (lib/promotions.ts). The code is checked by the server
// (checkPromotionCode); the form previews the discount with computePromotion
// and the save action re-checks and recomputes (resolveDocumentPromotion).
// The New Invoice form has the same box inline (invoice-form.tsx).

import { useEffect, useState } from "react"

import { checkPromotionCode } from "@/lib/actions/promotion-redeem-actions"
import { describePromotion, type PromotionConfig, type PromotionResult } from "@/lib/promotions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export type AppliedPromotion = { promotion: PromotionConfig; voucherId: string | null; code: string }

/** Code box state. Cleared when the party changes — vouchers and
 * per-customer limits depend on who's buying. */
export function usePromotionCode(customerId: string) {
  const [applied, setApplied] = useState<AppliedPromotion | null>(null)
  const [input, setInput] = useState("")
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    setApplied(null)
    setError("")
  }, [customerId])
  const apply = async () => {
    if (!input.trim()) return
    setChecking(true)
    setError("")
    try {
      const result = await checkPromotionCode(input, customerId || null)
      if (result.ok) {
        setApplied({ promotion: result.promotion, voucherId: result.voucherId, code: result.code })
        setInput(result.code)
      } else {
        setError(result.reason)
      }
    } catch {
      setError("Couldn't check that code — try again.")
    } finally {
      setChecking(false)
    }
  }
  const clear = () => {
    setApplied(null)
    setInput("")
  }
  return { applied, input, setInput, checking, error, apply, clear }
}

export function PromotionCodeBox({
  state,
  result,
  note,
}: {
  state: ReturnType<typeof usePromotionCode>
  result: PromotionResult | null
  /** One line under the box, e.g. when a voucher is spent. */
  note?: string
}) {
  const { applied } = state
  const total = result?.ok ? result.total : 0
  return (
    <div className="space-y-1.5 border-t pt-2" data-testid="promo-box">
      <Label className="text-xs">Offer / voucher code</Label>
      {applied ? (
        <div className="space-y-1 rounded-md border border-emerald-600/30 bg-emerald-600/10 p-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-emerald-800">
              {applied.code} · {applied.promotion.name}
            </span>
            <button type="button" className="text-xs text-red-600 hover:underline" onClick={state.clear}>
              Remove
            </button>
          </div>
          <p className="text-xs text-emerald-700">
            {describePromotion(applied.promotion)}
            {result?.ok ? ` — saving ₹${total.toFixed(2)}` : ""}
          </p>
          {result && !result.ok ? <p className="text-xs text-amber-700">{result.reason}</p> : null}
        </div>
      ) : (
        <div className="flex gap-1.5">
          <Input
            value={state.input}
            onChange={(event) => state.setInput(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                void state.apply()
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
            disabled={state.checking || !state.input.trim()}
            onClick={() => void state.apply()}
          >
            {state.checking ? "Checking…" : "Apply"}
          </Button>
        </div>
      )}
      {state.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      <input type="hidden" name="promotionCode" value={result?.ok ? applied?.code ?? "" : ""} />
    </div>
  )
}
