"use client"

import { startTransition, useActionState, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Copy, Gift, Trash2, Users } from "lucide-react"

import {
  getPromotionVouchers,
  issueVouchers,
  revokeVoucher,
  type IssueVouchersState,
  type PromotionCustomerOption,
  type PromotionRow,
  type PromotionVoucherRow,
} from "@/lib/actions/promotion-actions"
import { describePromotion } from "@/lib/promotions"
import { CustomerSelect } from "@/components/customers/customer-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader } from "@/components/ui/loader"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useToast } from "@/components/providers/toast-provider"
import { cn } from "@/lib/utils"

import { copyText, istShortDate, istToday } from "./offer-format"

type VoucherStatus = "unused" | "used" | "expired"

function voucherStatus(voucher: PromotionVoucherRow, now: number): VoucherStatus {
  if (voucher.usedAt) return "used"
  if (voucher.expiresAt && new Date(voucher.expiresAt).getTime() < now) return "expired"
  return "unused"
}

const initialIssueState: IssueVouchersState = { success: false, message: "" }

type VouchersSheetProps = {
  offer: PromotionRow | null
  onOpenChange: (open: boolean) => void
  canEdit: boolean
  customers: PromotionCustomerOption[]
}

export function VouchersSheet({ offer, onOpenChange, canEdit, customers }: VouchersSheetProps) {
  return (
    <Sheet open={Boolean(offer)} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
      >
        {offer ? <VouchersPanel key={offer.id} offer={offer} canEdit={canEdit} customers={customers} /> : null}
      </SheetContent>
    </Sheet>
  )
}

function VouchersPanel({
  offer,
  canEdit,
  customers,
}: {
  offer: PromotionRow
  canEdit: boolean
  customers: PromotionCustomerOption[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [vouchers, setVouchers] = useState<PromotionVoucherRow[] | null>(null)
  const [filter, setFilter] = useState<"all" | VoucherStatus>("all")
  const [search, setSearch] = useState("")
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [now] = useState(() => Date.now())

  const load = useCallback(async () => {
    try {
      setVouchers(await getPromotionVouchers(offer.id))
    } catch (error) {
      console.error(error)
      toast.error("Couldn't load vouchers")
      setVouchers([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer.id])

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(() => {
    const result = { all: 0, unused: 0, used: 0, expired: 0 }
    for (const voucher of vouchers ?? []) {
      result.all++
      result[voucherStatus(voucher, now)]++
    }
    return result
  }, [vouchers, now])

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (vouchers ?? []).filter(
      (voucher) =>
        (filter === "all" || voucherStatus(voucher, now) === filter) &&
        (!query ||
          voucher.code.toLowerCase().includes(query) ||
          (voucher.customerName ?? "").toLowerCase().includes(query) ||
          (voucher.customerPhone ?? "").includes(query)),
    )
  }, [vouchers, filter, search, now])

  async function handleCopy(code: string) {
    if (await copyText(code)) toast.success(`Copied ${code}`)
    else toast.error("Couldn't copy — select the code and copy it by hand")
  }

  async function handleRevoke(voucher: PromotionVoucherRow) {
    if (!window.confirm(`Revoke voucher ${voucher.code}? It will stop working immediately.`)) return
    try {
      setRevokingId(voucher.id)
      const result = await revokeVoucher(voucher.id)
      if (result.success) {
        toast.success(result.message)
        setVouchers((current) => (current ?? []).filter((row) => row.id !== voucher.id))
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to revoke the voucher")
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <>
      <SheetHeader className="border-b pr-12">
        <SheetTitle className="flex items-center gap-2">
          <Gift className="h-4 w-4" />
          Vouchers · {offer.name}
        </SheetTitle>
        <SheetDescription>
          {describePromotion(offer)}. Each voucher code works once; cancelling the invoice it was used on frees it
          again.
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-5 p-4">
        {canEdit ? (
          <IssueVoucherForm
            offer={offer}
            customers={customers}
            onIssued={() => {
              void load()
              router.refresh()
            }}
          />
        ) : null}

        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Voucher status">
            {(["all", "unused", "used", "expired"] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key}
                onClick={() => setFilter(key)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs capitalize transition",
                  filter === key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {key} ({counts[key]})
              </button>
            ))}
          </div>
          {(vouchers?.length ?? 0) > 6 ? (
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code, customer or phone…"
              aria-label="Search vouchers"
            />
          ) : null}

          {vouchers === null ? (
            <div className="flex justify-center py-8">
              <Loader className="h-5 w-5" />
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {vouchers.length === 0 ? "No vouchers issued for this offer yet." : "No vouchers match."}
            </div>
          ) : (
            <ul className="divide-y rounded-lg border" data-testid="voucher-list">
              {visible.map((voucher) => {
                const status = voucherStatus(voucher, now)
                return (
                  <li key={voucher.id} className="flex flex-wrap items-start gap-3 p-3" data-voucher-code={voucher.code}>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm font-semibold tracking-wide">
                          {voucher.code}
                        </code>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleCopy(voucher.code)}
                          aria-label={`Copy ${voucher.code}`}
                          title="Copy code"
                        >
                          <Copy />
                        </Button>
                        {status === "used" ? (
                          <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                            Used
                            {voucher.invoiceNumber ? " on " : ""}
                            {voucher.invoiceId && voucher.invoiceNumber ? (
                              <Link href={`/billing/${voucher.invoiceId}`} className="underline underline-offset-2">
                                {voucher.invoiceNumber}
                              </Link>
                            ) : null}
                          </Badge>
                        ) : status === "expired" ? (
                          <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                            Expired
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                            Unused
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {voucher.customerName ? (
                          <>
                            For{" "}
                            {voucher.customerId ? (
                              <Link href={`/customers/${voucher.customerId}`} className="text-foreground hover:underline">
                                {voucher.customerName}
                              </Link>
                            ) : (
                              voucher.customerName
                            )}
                            {voucher.customerPhone ? ` (${voucher.customerPhone})` : ""} ·{" "}
                          </>
                        ) : (
                          "Anyone · "
                        )}
                        Issued {istShortDate(voucher.issuedAt)}
                        {voucher.expiresAt ? ` · Expires ${istShortDate(voucher.expiresAt)}` : ""}
                        {voucher.usedAt ? ` · Used ${istShortDate(voucher.usedAt)}` : ""}
                      </p>
                      {voucher.note ? <p className="text-xs italic text-muted-foreground">{voucher.note}</p> : null}
                    </div>
                    {canEdit && !voucher.usedAt ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        disabled={revokingId === voucher.id}
                        onClick={() => handleRevoke(voucher)}
                        aria-label={`Revoke ${voucher.code}`}
                      >
                        {revokingId === voucher.id ? <Loader className="h-3 w-3" /> : <Trash2 />}
                        Revoke
                      </Button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}

function IssueVoucherForm({
  offer,
  customers,
  onIssued,
}: {
  offer: PromotionRow
  customers: PromotionCustomerOption[]
  onIssued: () => void
}) {
  const toast = useToast()
  const [mode, setMode] = useState<"customer" | "bulk">("customer")
  const [state, formAction, pending] = useActionState(issueVouchers, initialIssueState)
  const [lastCodes, setLastCodes] = useState<string[]>([])

  useEffect(() => {
    if (state.success) {
      toast.success(state.message)
      setLastCodes(state.codes ?? [])
      onIssued()
    } else if (state.message) {
      toast.error(state.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const err = (key: string) =>
    state.errors?.[key]?.[0] ? <p className="text-xs text-red-600">{state.errors[key][0]}</p> : null

  return (
    <section className="space-y-3 rounded-lg border p-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Issue vouchers">
        {(
          [
            { key: "customer", label: "To a customer", icon: Users },
            { key: "bulk", label: "Bulk codes", icon: Gift },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition",
              mode === key ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          startTransition(() => formAction(data))
        }}
      >
        <input type="hidden" name="promotionId" value={offer.id} />
        <input type="hidden" name="mode" value={mode} />

        {mode === "customer" ? (
          <div className="space-y-1.5 sm:col-span-2">
            <Label required>Customer</Label>
            {/* Own field name — never "customerId", which other forms on a
                page may already own (see CustomerSelect's newCustomerId). */}
            <CustomerSelect customers={customers} name="voucherCustomerId" placeholder="Search a customer" />
            {err("voucherCustomerId")}
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="voucher-quantity" required>
              How many codes
            </Label>
            <Input
              id="voucher-quantity"
              name="quantity"
              type="number"
              inputMode="numeric"
              min="1"
              max="200"
              step="1"
              defaultValue="10"
              required
            />
            <p className="text-xs text-muted-foreground">Up to 200, usable by anyone, once each.</p>
            {err("quantity")}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="voucher-expires">Expires on</Label>
          <Input id="voucher-expires" name="expiresAt" type="date" min={istToday()} />
          {err("expiresAt")}
        </div>
        <div className={cn("space-y-1.5", mode === "customer" && "sm:col-span-1")}>
          <Label htmlFor="voucher-note">Note</Label>
          <Input id="voucher-note" name="note" maxLength={200} placeholder="e.g. Birthday gift" />
          {err("note")}
        </div>

        <div className="flex items-end sm:col-span-2">
          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending ? <Loader className="h-4 w-4" /> : mode === "customer" ? "Issue voucher" : "Create codes"}
          </Button>
        </div>
      </form>

      {lastCodes.length ? (
        <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-900" data-testid="issued-codes">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {lastCodes.length === 1 ? "New voucher code" : `${lastCodes.length} new voucher codes`}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async () => {
                if (await copyText(lastCodes.join("\n"))) toast.success("Codes copied")
                else toast.error("Couldn't copy")
              }}
            >
              <Copy />
              {lastCodes.length === 1 ? "Copy" : "Copy all"}
            </Button>
          </div>
          <p className="max-h-32 overflow-y-auto break-all font-mono text-sm">{lastCodes.join(", ")}</p>
        </div>
      ) : null}
    </section>
  )
}
