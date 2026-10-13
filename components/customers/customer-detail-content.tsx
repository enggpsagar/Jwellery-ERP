import { IndianRupee, MapPin, User } from "lucide-react"

import type { Customer } from "@/lib/actions/customer-actions"
import { PartyBalance } from "@/components/customers/party-balance"
import { formatPartyBalanceText } from "@/lib/party-balance"
import {
  DetailField,
  DetailGrid,
  DetailSection,
} from "@/components/shared/detail-section"

type StateItem = {
  id: string
  name: string
}

/**
 * The body of a customer's detail view — Customer Information / Address /
 * Business Summary / Ledger. Shared between the standalone /customers/[id]
 * page (deep-linked from the ledger, invoices, reports, etc.) and the
 * inline detail pane on the Customers list itself, so the two can never
 * drift apart. Each caller supplies its own header/chrome around this.
 *
 * The ledger itself is a caller-supplied slot rather than rendered inline:
 * the standalone page's ledger is server-fetched, the inline panel's is a
 * client-fetched twin (a server component can't be reached from a client
 * component by import), and this shared body has no reason to know which.
 */
export function CustomerDetailContent({
  customer,
  ledger,
}: {
  customer: Customer
  states: StateItem[]
  ledger: React.ReactNode
}) {
  const money = (value: unknown) => `₹ ${Number(value || 0).toLocaleString("en-IN")}`

  // Hidden entirely when there's nothing to show — an "Address" card with
  // every field blank is an empty box, not information.
  const hasAddress = Boolean(
    customer.city || customer.state || customer.pincode || customer.address || customer.notes,
  )

  return (
    <div className="space-y-6">
      {/* The party's ONE net balance (lib/party-balance.ts) — sales,
          purchases, payments in and out all in one figure, Receivable when
          they owe the store, Payable when the store owes them. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Net Balance</p>
          <p className="text-xs text-muted-foreground">
            {customer.balanceType === "Receivable"
              ? "This party owes you"
              : customer.balanceType === "Payable"
                ? "You owe this party"
                : "Nothing owed either way"}
          </p>
        </div>
        <PartyBalance net={customer.netBalance} size="lg" />
      </div>

      {/* Ledger first — it's the primary reason this page gets opened day
          to day (financial activity), not the contact-card details below
          it. The customer's own identity is already established by this
          page's own header, so it doesn't need to lead here too. Stays
          full-width above the grid below it — a ledger table wants the
          room, unlike the smaller info cards. */}
      {ledger}

      {/* Two columns on a wide screen instead of one long single-column
          stack — on a desktop-width max-w-5xl page these cards otherwise
          sit narrow in the middle with acres of empty space either side.
          A plain lg: viewport breakpoint, not @container/@lg: an attempt to
          key this off the CARD's own width (matching this same component's
          narrower inline split-panel use) stacked a THIRD nested
          container-type:inline-size boundary on top of two Shadcn Card
          internals already use — confirmed live to collapse the entire
          chain to a ~375px shrink-to-fit width even at a 1440px viewport,
          since nothing in a chain of nested containment boundaries had an
          actual definite width left to stretch against. DetailGrid's own
          @container below (a single level, no stacking) is unaffected and
          stays as-is — this only reverts the OUTER grid. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DetailSection
          title="Party Information"
          icon={User}
          tint="var(--chart-1)"
        >
          <DetailGrid>
            <DetailField label="Phone" value={customer.phone} />
            <DetailField label="Alternate Phone" value={customer.altPhone} />
            <DetailField label="Email" value={customer.email} />
            <DetailField label="GST Number" value={customer.gstNumber} />
            <DetailField label="Party Type" value={customer.customerType} />
          </DetailGrid>
        </DetailSection>

        {hasAddress ? (
          <DetailSection
            title="Address"
            description="Where this party is based."
            icon={MapPin}
            tint="var(--chart-3)"
          >
            {/* dense = two columns from the start: City and State share a
                row even in the narrow side panel; Full Address / Notes span. */}
            <DetailGrid dense>
              <DetailField label="City" value={customer.city} />
              <DetailField label="State" value={customer.state} />
              <DetailField label="Pincode" value={customer.pincode} />
              <DetailField
                label="Full Address"
                span
                value={
                  customer.address ? (
                    <span className="whitespace-pre-line">{customer.address}</span>
                  ) : null
                }
              />
              <DetailField
                label="Notes"
                span
                value={
                  customer.notes ? (
                    <span className="whitespace-pre-line">{customer.notes}</span>
                  ) : null
                }
              />
            </DetailGrid>
          </DetailSection>
        ) : null}

        {/* Hidden when there's nothing to summarize — a customer with zero
            orders and no opening balance has no business activity to show;
            totalPurchaseValue/pendingAmount are both derived from the same
            invoices totalOrders counts, so they can't be nonzero on their
            own once that's zero. */}
        {(customer.totalOrders ?? 0) > 0 || customer.openingBalance !== 0 ? (
        <DetailSection
          title="Business Summary"
          icon={IndianRupee}
          tint="var(--chart-2)"
        >
          <DetailGrid>
            <DetailField label="Total Orders" value={customer.totalOrders ?? 0} />
            <DetailField
              label="Total Purchase Value"
              value={customer.totalPurchaseValue ?? money(0)}
            />
            <DetailField
              label="Opening Balance"
              value={customer.openingBalance !== 0 ? formatPartyBalanceText(customer.openingBalance) : undefined}
            />
            <DetailField label="Last Purchase" value={customer.lastPurchaseDate} />
            <DetailField label="Last Payment" value={customer.lastPaymentDate} />
          </DetailGrid>
        </DetailSection>
        ) : null}
      </div>

    </div>
  )
}
