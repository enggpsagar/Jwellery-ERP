"use client"

import { startTransition, useActionState, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Check } from "lucide-react"

import { upsertPromotion, type PromotionFormState, type PromotionRow } from "@/lib/actions/promotion-actions"
import { describePromotion } from "@/lib/promotions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader } from "@/components/ui/loader"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/components/providers/toast-provider"
import { cn } from "@/lib/utils"

import { istDateInput } from "./offer-format"

export type TaxonomyOption = { id: string; name: string; isActive: boolean; hint?: string }

type OfferType = PromotionRow["type"]
type OfferTarget = PromotionRow["target"]

const TYPE_OPTIONS: { value: OfferType; title: string; hint: string }[] = [
  { value: "PERCENT_OFF", title: "% off", hint: "e.g. 10% off the bill" },
  { value: "FLAT_OFF", title: "Flat ₹ off", hint: "e.g. ₹500 off" },
  { value: "BUY_X_GET_Y", title: "Buy X get Y", hint: "e.g. buy 2 get 1 free" },
]

const TARGET_OPTIONS: { value: OfferTarget; title: string; hint: string }[] = [
  { value: "BILL", title: "Item value", hint: "Metal + making + stones, before GST" },
  { value: "MAKING_CHARGES", title: "Making charges only", hint: "Making + hallmark charges" },
]

const initialState: PromotionFormState = { success: false, message: "" }

type OfferFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  offer: PromotionRow | null
  categories: TaxonomyOption[]
  metals: TaxonomyOption[]
}

export function OfferFormDialog({ open, onOpenChange, offer, categories, metals }: OfferFormDialogProps) {
  const router = useRouter()
  const toast = useToast()
  const [state, formAction, pending] = useActionState(upsertPromotion, initialState)

  const [type, setType] = useState<OfferType>(offer?.type ?? "PERCENT_OFF")
  const [target, setTarget] = useState<OfferTarget>(offer?.target ?? "BILL")
  const [percentOff, setPercentOff] = useState(offer?.percentOff?.toString() ?? "")
  const [amountOff, setAmountOff] = useState(offer?.amountOff?.toString() ?? "")
  const [buyQuantity, setBuyQuantity] = useState(offer?.buyQuantity?.toString() ?? "2")
  const [getQuantity, setGetQuantity] = useState(offer?.getQuantity?.toString() ?? "1")
  const [getPercentOff, setGetPercentOff] = useState(offer?.getPercentOff?.toString() ?? "100")
  const [categoryIds, setCategoryIds] = useState<string[]>(offer?.categoryIds ?? [])
  const [metalTypeIds, setMetalTypeIds] = useState<string[]>(offer?.metalTypeIds ?? [])

  useEffect(() => {
    if (state.success) {
      toast.success(state.message)
      router.refresh()
      onOpenChange(false)
    } else if (state.message) {
      toast.error(state.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const effectiveTarget = type === "BUY_X_GET_Y" ? "BILL" : target
  const preview = useMemo(
    () =>
      describePromotion({
        type,
        target: effectiveTarget,
        percentOff: percentOff ? Number(percentOff) : null,
        amountOff: amountOff ? Number(amountOff) : null,
        buyQuantity: buyQuantity ? Number(buyQuantity) : null,
        getQuantity: getQuantity ? Number(getQuantity) : null,
        getPercentOff: getPercentOff ? Number(getPercentOff) : null,
      }),
    [type, effectiveTarget, percentOff, amountOff, buyQuantity, getQuantity, getPercentOff],
  )

  const err = (key: string) =>
    state.errors?.[key]?.[0] ? <p className="text-xs text-red-600">{state.errors[key][0]}</p> : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{offer ? "Edit offer" : "New offer"}</DialogTitle>
          <DialogDescription>
            Applied on New Invoice when the offer&apos;s code (or one of its vouchers) is entered. The discount comes
            off the item value before GST.
          </DialogDescription>
        </DialogHeader>

        <form
          id="offer-form"
          className="space-y-5"
          onSubmit={(event) => {
            // Not action={formAction}: React would reset the uncontrolled
            // fields after a failed validation (see gst-rate-settings-form).
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            startTransition(() => formAction(data))
          }}
        >
          <input type="hidden" name="id" value={offer?.id ?? ""} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="target" value={effectiveTarget} />
          {categoryIds.map((id) => (
            <input key={id} type="hidden" name="categoryIds" value={id} />
          ))}
          {metalTypeIds.map((id) => (
            <input key={id} type="hidden" name="metalTypeIds" value={id} />
          ))}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="offer-name" required>
                Offer name
              </Label>
              <Input id="offer-name" name="name" defaultValue={offer?.name ?? ""} placeholder="e.g. Diwali Making Offer" required />
              {err("name")}
            </div>
          </div>

          <section className="space-y-2">
            <p className="text-sm font-medium">Kind of offer</p>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Kind of offer">
              {TYPE_OPTIONS.map((option) => (
                <ChoiceCard
                  key={option.value}
                  selected={type === option.value}
                  onSelect={() => setType(option.value)}
                  title={option.title}
                  hint={option.hint}
                />
              ))}
            </div>
            {err("type")}
          </section>

          <section className="grid gap-4 rounded-lg border bg-muted/30 p-3 sm:grid-cols-3">
            {type === "PERCENT_OFF" ? (
              <div className="space-y-1.5">
                <Label htmlFor="offer-percent" required>
                  Discount %
                </Label>
                <Input
                  id="offer-percent"
                  name="percentOff"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  max="100"
                  value={percentOff}
                  onChange={(e) => setPercentOff(e.target.value)}
                  placeholder="10"
                  required
                />
                {err("percentOff")}
              </div>
            ) : null}
            {type === "FLAT_OFF" ? (
              <div className="space-y-1.5">
                <Label htmlFor="offer-amount" required>
                  Amount off (₹)
                </Label>
                <Input
                  id="offer-amount"
                  name="amountOff"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  value={amountOff}
                  onChange={(e) => setAmountOff(e.target.value)}
                  placeholder="500"
                  required
                />
                {err("amountOff")}
              </div>
            ) : null}
            {type === "BUY_X_GET_Y" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="offer-buy" required>
                    Buy (pieces)
                  </Label>
                  <Input
                    id="offer-buy"
                    name="buyQuantity"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={buyQuantity}
                    onChange={(e) => setBuyQuantity(e.target.value)}
                    required
                  />
                  {err("buyQuantity")}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="offer-get" required>
                    Get (pieces)
                  </Label>
                  <Input
                    id="offer-get"
                    name="getQuantity"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={getQuantity}
                    onChange={(e) => setGetQuantity(e.target.value)}
                    required
                  />
                  {err("getQuantity")}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="offer-get-percent">% off those pieces</Label>
                  <Input
                    id="offer-get-percent"
                    name="getPercentOff"
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    max="100"
                    step="0.01"
                    value={getPercentOff}
                    onChange={(e) => setGetPercentOff(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">100 = free. The cheapest pieces get it.</p>
                  {err("getPercentOff")}
                </div>
              </>
            ) : null}
            {type !== "FLAT_OFF" ? (
              <div className="space-y-1.5">
                <Label htmlFor="offer-max">Maximum discount (₹)</Label>
                <Input
                  id="offer-max"
                  name="maxDiscount"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  defaultValue={offer?.maxDiscount ?? ""}
                  placeholder="No cap"
                />
                {err("maxDiscount")}
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="offer-min-bill">Minimum bill (₹)</Label>
              <Input
                id="offer-min-bill"
                name="minBillAmount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                defaultValue={offer?.minBillAmount ?? ""}
                placeholder="Any amount"
              />
              {err("minBillAmount")}
            </div>
            <p className="text-sm text-muted-foreground sm:col-span-3">
              Shows on the bill as: <span className="font-medium text-foreground">{preview}</span>
            </p>
          </section>

          {type !== "BUY_X_GET_Y" ? (
            <section className="space-y-2">
              <p className="text-sm font-medium">Discount applies to</p>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Discount applies to">
                {TARGET_OPTIONS.map((option) => (
                  <ChoiceCard
                    key={option.value}
                    selected={target === option.value}
                    onSelect={() => setTarget(option.value)}
                    title={option.title}
                    hint={option.hint}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <div>
              <p className="text-sm font-medium">Which items qualify</p>
              <p className="text-xs text-muted-foreground">Leave both empty for every item on the bill.</p>
            </div>
            <ChipPicker
              label="Categories"
              emptyLabel="All categories"
              options={categories}
              selected={categoryIds}
              onChange={setCategoryIds}
            />
            {err("categoryIds")}
            <ChipPicker
              label="Metals & stones"
              emptyLabel="All metals"
              options={metals}
              selected={metalTypeIds}
              onChange={setMetalTypeIds}
            />
            {err("metalTypeIds")}
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="offer-from">Starts on</Label>
              <Input id="offer-from" name="validFrom" type="date" defaultValue={istDateInput(offer?.validFrom)} />
              {err("validFrom")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-until">Ends on</Label>
              <Input id="offer-until" name="validUntil" type="date" defaultValue={istDateInput(offer?.validUntil)} />
              {err("validUntil")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-usage">Total uses allowed</Label>
              <Input
                id="offer-usage"
                name="usageLimit"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                defaultValue={offer?.usageLimit ?? ""}
                placeholder="Unlimited"
              />
              {err("usageLimit")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-per-customer">Uses per customer</Label>
              <Input
                id="offer-per-customer"
                name="perCustomerLimit"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                defaultValue={offer?.perCustomerLimit ?? ""}
                placeholder="Unlimited"
              />
              {err("perCustomerLimit")}
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="offer-code">Public code</Label>
              <Input
                id="offer-code"
                name="code"
                defaultValue={offer?.code ?? ""}
                placeholder="e.g. DIWALI10"
                maxLength={30}
                autoCapitalize="characters"
                autoComplete="off"
                className="font-mono uppercase"
                onInput={(e) => {
                  const el = e.currentTarget
                  el.value = el.value.toUpperCase().replace(/\s+/g, "")
                }}
              />
              <p className="text-xs text-muted-foreground">
                Optional. Anyone with this code can use the offer. Leave empty to give it out only as vouchers.
              </p>
              {err("code")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-description">Note (internal)</Label>
              <Textarea
                id="offer-description"
                name="description"
                rows={3}
                defaultValue={offer?.description ?? ""}
                placeholder="e.g. Festive season, ask for ID"
              />
            </div>
          </section>
        </form>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="offer-form" disabled={pending}>
            {pending ? <Loader className="h-4 w-4" /> : offer ? "Save changes" : "Create offer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ChoiceCard({
  selected,
  onSelect,
  title,
  hint,
}: {
  selected: boolean
  onSelect: () => void
  title: string
  hint: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex items-start gap-2 rounded-lg border p-3 text-left transition hover:bg-muted/60",
        selected && "border-primary bg-primary/5 ring-1 ring-primary",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
          selected && "border-primary bg-primary text-primary-foreground",
        )}
      >
        {selected ? <Check className="h-3 w-3" /> : null}
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  )
}

function ChipPicker({
  label,
  emptyLabel,
  options,
  selected,
  onChange,
}: {
  label: string
  emptyLabel: string
  options: TaxonomyOption[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const [search, setSearch] = useState("")
  // Inactive rows only show when already chosen (an old offer keeps them).
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return options.filter(
      (option) =>
        (option.isActive || selected.includes(option.id)) && (!query || option.name.toLowerCase().includes(query)),
    )
  }, [options, search, selected])

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id])

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          {label}:{" "}
          <span className="text-muted-foreground">
            {selected.length ? `${selected.length} selected` : emptyLabel}
          </span>
        </p>
        <div className="flex items-center gap-2">
          {options.length > 8 ? (
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-8 w-36"
              aria-label={`Search ${label}`}
            />
          ) : null}
          {selected.length ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
              Clear
            </Button>
          ) : null}
        </div>
      </div>
      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground">None set up in Settings → Metals &amp; Categories.</p>
      ) : (
        <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
          {visible.map((option) => {
            const on = selected.includes(option.id)
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(option.id)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition",
                  on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {on ? <Check className="h-3 w-3" /> : null}
                {option.name}
                {option.hint ? <span className={on ? "opacity-80" : "text-muted-foreground"}>· {option.hint}</span> : null}
              </button>
            )
          })}
          {visible.length === 0 ? <p className="text-xs text-muted-foreground">No match.</p> : null}
        </div>
      )}
    </div>
  )
}
