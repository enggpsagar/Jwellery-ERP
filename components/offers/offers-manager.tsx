"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CalendarDays, Copy, Filter, Gift, Pencil, Plus, Tag, Ticket, Users } from "lucide-react"

import {
  setPromotionActive,
  type PromotionCustomerOption,
  type PromotionRow,
} from "@/lib/actions/promotion-actions"
import { describePromotion } from "@/lib/promotions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/providers/toast-provider"

import { OfferFormDialog, type TaxonomyOption } from "./offer-form-dialog"
import { VouchersSheet } from "./vouchers-sheet"
import {
  copyText,
  offerStatus,
  rupees,
  STATUS_CLASS,
  STATUS_LABEL,
  validityLabel,
  type OfferStatus,
} from "./offer-format"

type OffersManagerProps = {
  offers: PromotionRow[]
  categories: TaxonomyOption[]
  metals: TaxonomyOption[]
  customers: PromotionCustomerOption[]
  canEdit: boolean
}

type StatusFilter = "all" | "live" | "inactive"

const LIVE: OfferStatus[] = ["running", "scheduled"]

export function OffersManager({ offers, categories, metals, customers, canEdit }: OffersManagerProps) {
  const router = useRouter()
  const toast = useToast()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PromotionRow | null>(null)
  const [voucherOfferId, setVoucherOfferId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [search, setSearch] = useState("")

  const nameOf = useMemo(() => {
    const map = new Map<string, string>()
    for (const option of [...categories, ...metals]) map.set(option.id, option.name)
    return (id: string) => map.get(id) ?? "Removed"
  }, [categories, metals])

  const withStatus = useMemo(() => offers.map((offer) => ({ offer, status: offerStatus(offer) })), [offers])

  const summary = useMemo(
    () => ({
      running: withStatus.filter((row) => row.status === "running").length,
      redemptions: offers.reduce((sum, offer) => sum + offer.redemptions, 0),
      discount: offers.reduce((sum, offer) => sum + offer.discountGiven, 0),
      unusedVouchers: offers.reduce((sum, offer) => sum + (offer.vouchersIssued - offer.vouchersUsed), 0),
    }),
    [offers, withStatus],
  )

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return withStatus.filter(({ offer, status }) => {
      if (statusFilter === "live" && !LIVE.includes(status)) return false
      if (statusFilter === "inactive" && LIVE.includes(status)) return false
      return !query || offer.name.toLowerCase().includes(query) || (offer.code ?? "").toLowerCase().includes(query)
    })
  }, [withStatus, statusFilter, search])

  // Keep the open Vouchers panel pointing at the refreshed row.
  const voucherOffer = offers.find((offer) => offer.id === voucherOfferId) ?? null

  function openNew() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(offer: PromotionRow) {
    setEditing(offer)
    setFormOpen(true)
  }

  async function handleToggle(offer: PromotionRow, active: boolean) {
    try {
      setTogglingId(offer.id)
      const result = await setPromotionActive(offer.id, active)
      if (result.success) {
        toast.success(result.message)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to update the offer")
    } finally {
      setTogglingId(null)
    }
  }

  async function handleCopy(code: string) {
    if (await copyText(code)) toast.success(`Copied ${code}`)
    else toast.error("Couldn't copy")
  }

  const cards = [
    { label: "Running now", value: String(summary.running) },
    { label: "Bills with an offer", value: String(summary.redemptions) },
    { label: "Discount given", value: rupees(summary.discount) },
    { label: "Unused vouchers", value: String(summary.unusedVouchers) },
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-lg font-semibold">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { key: "all", label: "All" },
              { key: "live", label: "Running & upcoming" },
              { key: "inactive", label: "Paused & ended" },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={statusFilter === option.key}
              onClick={() => setStatusFilter(option.key)}
              className={
                statusFilter === option.key
                  ? "rounded-full border border-primary bg-primary px-3 py-1 text-xs text-primary-foreground"
                  : "rounded-full border px-3 py-1 text-xs hover:bg-muted"
              }
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {offers.length > 4 ? (
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or code…"
              className="h-9 sm:w-56"
              aria-label="Search offers"
            />
          ) : null}
          {canEdit ? (
            <Button type="button" onClick={openNew} className="h-9 shrink-0 gap-1.5">
              <Plus className="h-4 w-4" />
              New offer
            </Button>
          ) : null}
        </div>
      </div>

      {offers.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Gift className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-medium">No offers yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Run a festive discount, a making-charge offer or a buy-2-get-1 — then give customers a code to use on New
            Invoice, or issue them single-use vouchers.
          </p>
          {canEdit ? (
            <Button type="button" onClick={openNew} className="mt-4 gap-1.5">
              <Plus className="h-4 w-4" />
              Create your first offer
            </Button>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">Only the Store Owner can create offers.</p>
          )}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No offers match.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map(({ offer, status }) => {
            const filters = [
              offer.categoryIds.length ? offer.categoryIds.map(nameOf).join(", ") : null,
              offer.metalTypeIds.length ? offer.metalTypeIds.map(nameOf).join(", ") : null,
            ].filter(Boolean)
            const limits = [
              offer.minBillAmount != null ? `Min bill ${rupees(offer.minBillAmount)}` : null,
              offer.maxDiscount != null ? `Up to ${rupees(offer.maxDiscount)}` : null,
              offer.perCustomerLimit != null
                ? `${offer.perCustomerLimit}× per customer`
                : null,
            ].filter(Boolean)

            return (
              <Card key={offer.id} data-testid="offer-card" data-offer-id={offer.id} className={offer.isActive ? "" : "opacity-80"}>
                <CardContent className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold">{offer.name}</h3>
                        <Badge variant="outline" className={STATUS_CLASS[status]}>
                          {STATUS_LABEL[status]}
                        </Badge>
                      </div>
                      <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
                        <Tag className="h-3.5 w-3.5" />
                        {describePromotion(offer)}
                      </p>
                    </div>
                    {canEdit ? (
                      <Switch
                        checked={offer.isActive}
                        disabled={togglingId === offer.id}
                        onCheckedChange={(checked) => handleToggle(offer, checked)}
                        aria-label={offer.isActive ? `Pause ${offer.name}` : `Run ${offer.name}`}
                      />
                    ) : null}
                  </div>

                  <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
                    <div className="flex items-center gap-1.5">
                      <Ticket className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <dt className="sr-only">Code</dt>
                      <dd className="flex min-w-0 items-center gap-1">
                        {offer.code ? (
                          <>
                            <code className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold">
                              {offer.code}
                            </code>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => handleCopy(offer.code!)}
                              aria-label={`Copy ${offer.code}`}
                              title="Copy code"
                            >
                              <Copy />
                            </Button>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Vouchers only</span>
                        )}
                      </dd>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <dt className="sr-only">Valid</dt>
                      <dd>{validityLabel(offer)}</dd>
                    </div>
                    <div className="flex items-start gap-1.5 sm:col-span-2">
                      <Filter className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <dt className="sr-only">Applies to</dt>
                      <dd className="text-muted-foreground">
                        {offer.target === "MAKING_CHARGES" ? "Making charges of " : ""}
                        {filters.length ? filters.join(" · ") : "All items"}
                        {limits.length ? ` · ${limits.join(" · ")}` : ""}
                      </dd>
                    </div>
                  </dl>

                  {offer.description ? <p className="text-xs italic text-muted-foreground">{offer.description}</p> : null}

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        <span className="font-semibold text-foreground">{offer.redemptions}</span>
                        {offer.usageLimit != null ? ` of ${offer.usageLimit}` : ""} used
                      </span>
                      <span>
                        <span className="font-semibold text-foreground">{rupees(offer.discountGiven)}</span> given
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {offer.vouchersIssued} vouchers · {offer.vouchersUsed} used
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {canEdit ? (
                        <Button type="button" variant="outline" size="sm" onClick={() => openEdit(offer)} aria-label={`Edit ${offer.name}`}>
                          <Pencil />
                          Edit
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setVoucherOfferId(offer.id)}
                        aria-label={`Vouchers for ${offer.name}`}
                      >
                        <Gift />
                        Vouchers
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {canEdit && formOpen ? (
        <OfferFormDialog
          key={editing?.id ?? "new"}
          open={formOpen}
          onOpenChange={setFormOpen}
          offer={editing}
          categories={categories}
          metals={metals}
        />
      ) : null}

      <VouchersSheet
        offer={voucherOffer}
        onOpenChange={(open) => {
          if (!open) setVoucherOfferId(null)
        }}
        canEdit={canEdit}
        customers={customers}
      />
    </div>
  )
}
