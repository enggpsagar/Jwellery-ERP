"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  IndianRupee,
  Loader2,
  ScanLine,
} from "lucide-react"

import {
  completeQuickSale,
  type QuickSaleCustomer,
  type QuickSaleState,
  type QuickSaleTarget,
} from "@/lib/actions/quick-sale-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  CustomerSelect,
  type CustomerOption,
} from "@/components/customers/customer-select"

const initialState: QuickSaleState = { success: false, message: "" }

const PURITY_LABELS: Record<string, string> = {
  GOLD_18K: "18K",
  GOLD_20K: "20K",
  GOLD_22K: "22K",
  GOLD_24K: "24K",
  SILVER_925: "925",
  SILVER_999: "999",
  OTHER: "",
}

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value)
}

/** One fact about the piece. */
function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  )
}

/** One line of the confirmation summary. */
function ReviewRow({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={
          emphasis
            ? "text-lg font-semibold tabular-nums"
            : "text-right text-sm font-medium"
        }
      >
        {value}
      </span>
    </div>
  )
}

export function QuickSaleForm({
  target,
  customers,
  token,
}: {
  target: QuickSaleTarget
  customers: QuickSaleCustomer[]
  /** Scan token: says which shop this sale is written to. */
  token: string
}) {
  const [state, formAction, pending] = useActionState(
    completeQuickSale,
    initialState,
  )

  const [price, setPrice] = useState(
    target.suggestedPrice ? String(target.suggestedPrice) : "",
  )
  const [customerId, setCustomerId] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [fullyPaid, setFullyPaid] = useState(true)

  // Review is a step, not a separate route: going back must not lose what was
  // typed, and on a phone a round trip to the server between "enter" and
  // "confirm" is the difference between quick and not.
  const [reviewing, setReviewing] = useState(false)

  const priceValue = Number(price)
  const priceIsUsable = Number.isFinite(priceValue) && priceValue > 0
  const readyToReview = priceIsUsable && Boolean(customerId)

  // Done. Its own screen rather than a toast — the next action is either
  // "print the bill" or "scan the next tag", and both need to stay on screen
  // while the customer is still at the counter.
  if (state.success && state.invoiceId) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-5 p-8 text-center">
          <CheckCircle2 className="size-12 text-[var(--chart-3)]" />

          <div>
            <h2 className="text-xl font-semibold">Sale recorded</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {target.productName} · {money(priceValue)}
              {customerName ? ` · ${customerName}` : ""}
            </p>
          </div>

          <div className="grid w-full gap-2">
            <Button
              asChild
              size="lg"
              className="bg-[var(--chart-2)] text-white hover:bg-[color-mix(in_oklab,var(--chart-2)_88%,black)]"
            >
              <Link href={`/billing/${state.invoiceId}`}>
                Open invoice
                <ArrowRight className="ml-1.5 size-4" />
              </Link>
            </Button>

            <Button asChild variant="outline" size="lg">
              <Link href="/inventory/stock">Back to stock</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Sold, reserved, out with a karigar — the scan worked, the sale cannot.
  // Said plainly, because the alternative is an operator typing a price into
  // a form that was never going to submit.
  if (target.blockedReason) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="flex flex-col items-center gap-5 p-8 text-center">
          <AlertTriangle className="size-10 text-destructive" />

          <div>
            <h2 className="text-lg font-semibold">Can&apos;t sell this piece</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {target.blockedReason}
            </p>
          </div>

          <Button asChild variant="outline" className="w-full">
            <Link href={`/inventory/stock/${target.stockId}`}>
              View stock details
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const purity = target.purity ? (PURITY_LABELS[target.purity] ?? "") : ""
  const metalLabel = [target.metalName, purity].filter(Boolean).join(" ")
  const quantityValue = Math.max(1, Number(quantity) || 1)

  return (
    <div className="space-y-4">
      {/* What was scanned, so the operator can check the tag in their hand
          against the screen before taking money for it. */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b bg-[color-mix(in_oklab,var(--chart-2)_10%,transparent)] px-5 py-2.5">
          <ScanLine className="size-4 text-[var(--chart-2)]" />
          <span className="text-xs font-medium tracking-wide text-[color-mix(in_oklab,var(--chart-2)_75%,black)] uppercase">
            Scanned
          </span>
        </div>

        <CardContent className="p-5">
          <h2 className="text-lg font-semibold">{target.productName}</h2>
          <p className="font-mono text-xs text-muted-foreground">
            {target.stockCode}
            {target.productCode ? ` · ${target.productCode}` : ""}
            {target.tagNumber ? ` · Tag ${target.tagNumber}` : ""}
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {metalLabel ? <Spec label="Metal" value={metalLabel} /> : null}
            {target.netWeight ? (
              <Spec label="Net weight" value={`${target.netWeight} g`} />
            ) : null}
            {target.grossWeight ? (
              <Spec label="Gross weight" value={`${target.grossWeight} g`} />
            ) : null}
            {target.stoneWeight ? (
              <Spec label="Stone weight" value={`${target.stoneWeight} g`} />
            ) : null}
            <Spec label="In stock" value={String(target.quantityAvailable)} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 sm:p-6">
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
            className="flex flex-col gap-5"
          >
            {/* The values submitted are always these hidden fields, so what
                was reviewed on the confirm step is exactly what is sent. */}
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="stockId" value={target.stockId} />
            <input type="hidden" name="customerId" value={customerId} />
            <input type="hidden" name="quantity" value={String(quantityValue)} />
            {/* Paid in full is the counter norm; unticking books the whole
                amount to the customer's ledger instead. */}
            <input
              type="hidden"
              name="paidAmount"
              value={fullyPaid && priceIsUsable ? String(priceValue) : "0"}
            />
            <input
              type="hidden"
              name="sellingPrice"
              value={priceIsUsable ? String(priceValue) : ""}
            />

            {reviewing ? (
              <>
                <div>
                  <h3 className="text-base font-semibold">Confirm the sale</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Check this over — the invoice is created and the stock is
                    marked sold as soon as you confirm.
                  </p>
                </div>

                <div className="divide-y rounded-lg border px-4">
                  <ReviewRow label="Item" value={target.productName} />
                  <ReviewRow label="Tag" value={target.stockCode} />
                  <ReviewRow label="Customer" value={customerName || "—"} />
                  {quantityValue > 1 ? (
                    <ReviewRow label="Quantity" value={String(quantityValue)} />
                  ) : null}
                  <ReviewRow
                    label="Payment"
                    value={fullyPaid ? "Paid in full" : "On credit — to ledger"}
                  />
                  <ReviewRow
                    label="Total"
                    value={money(priceValue)}
                    emphasis
                  />
                </div>

                {!state.success && state.message ? (
                  <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {state.message}
                  </p>
                ) : null}

                <div className="grid gap-2">
                  <Button
                    type="submit"
                    size="lg"
                    disabled={pending}
                    className="h-14 bg-[var(--chart-2)] text-base text-white hover:bg-[color-mix(in_oklab,var(--chart-2)_88%,black)]"
                  >
                    {pending && <Loader2 className="mr-2 size-5 animate-spin" />}
                    {pending ? "Creating invoice..." : "Confirm & create invoice"}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => setReviewing(false)}
                  >
                    <ArrowLeft className="mr-1.5 size-4" />
                    Change details
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="customer" required>Customer</Label>
                  {/* The same picker the full invoice form uses — searchable,
                      and able to create a customer inline, so a first-time
                      buyer at the counter doesn't end the sale.

                      Its own hidden input is given a throwaway name: the
                      value actually submitted is the one below, which stays
                      mounted through the review step. Letting the picker
                      unmount with the field would submit an empty customer. */}
                  <CustomerSelect
                    name="__customerPicker"
                    customers={customers as CustomerOption[]}
                    defaultValue={customerId}
                    onChange={(id, entry) => {
                      setCustomerId(id)
                      setCustomerName(entry?.name ?? "")
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sellingPriceInput" className="text-base" required>
                    Selling price
                  </Label>

                  <div className="relative">
                    <IndianRupee className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="sellingPriceInput"
                      type="number"
                      inputMode="decimal"
                      min={1}
                      step="1"
                      value={price}
                      onChange={(event) => setPrice(event.target.value)}
                      // Large and finger-sized: this is filled in on a phone
                      // at a counter, one-handed.
                      className="h-16 pl-11 text-2xl font-semibold tabular-nums"
                      placeholder="0"
                    />
                  </div>

                  {target.suggestedPrice ? (
                    <p className="text-xs text-muted-foreground">
                      Suggested {money(target.suggestedPrice)} from the recorded
                      rate — change it to what the piece actually sold for.
                    </p>
                  ) : null}
                </div>

                {/* Only worth asking when there is more than one to sell. */}
                {target.quantityAvailable > 1 ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="quantityInput">Quantity</Label>
                    <Input
                      id="quantityInput"
                      type="number"
                      min={1}
                      max={target.quantityAvailable}
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                      className="h-11 max-w-28 tabular-nums"
                    />
                    <p className="text-xs text-muted-foreground">
                      The price above is the total for the sale.
                    </p>
                  </div>
                ) : null}

                <label className="flex items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={fullyPaid}
                    onChange={(event) => setFullyPaid(event.target.checked)}
                    className="size-4 accent-[var(--chart-2)]"
                  />
                  Paid in full
                  {!fullyPaid ? (
                    <span className="text-xs text-muted-foreground">
                      — goes to the customer&apos;s ledger
                    </span>
                  ) : null}
                </label>

                {!state.success && state.message ? (
                  <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {state.message}
                  </p>
                ) : null}

                <Button
                  type="button"
                  size="lg"
                  disabled={!readyToReview}
                  onClick={() => setReviewing(true)}
                  className="h-14 bg-[var(--chart-2)] text-base text-white hover:bg-[color-mix(in_oklab,var(--chart-2)_88%,black)]"
                >
                  Review sale
                  <ArrowRight className="ml-1.5 size-5" />
                </Button>
              </>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
