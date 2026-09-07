import { IndianRupee, MapPin, User } from "lucide-react"

import type { Customer } from "@/lib/actions/customer-actions"
import { toTitleCase } from "@/lib/utils"
import {
  DetailField,
  DetailGrid,
  DetailSection,
} from "@/components/shared/detail-section"
import { CustomerVendorLinkCard } from "@/components/customers/customer-vendor-link-card"

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
  onLinkChanged,
}: {
  customer: Customer
  states: StateItem[]
  ledger: React.ReactNode
  /** See CustomerVendorLinkCard's own doc comment on its onChanged prop. */
  onLinkChanged?: () => void
}) {
  const money = (value: unknown) => `₹ ${Number(value || 0).toLocaleString("en-IN")}`

  // Hidden entirely when there's nothing to show — an "Address" card with
  // every field blank is an empty box, not information.
  const hasAddress = Boolean(
    customer.city || customer.state || customer.pincode || customer.address || customer.notes,
  )

  return (
    <div className="space-y-6">
      {/* Ledger first — it's the primary reason this page gets opened day
          to day (financial activity), not the contact-card details below
          it. The customer's own identity is already established by this
          page's own header, so it doesn't need to lead here too. */}
      {ledger}

      <CustomerVendorLinkCard
        customerId={customer.id}
        linkedVendor={customer.linkedVendor ?? null}
        onChanged={onLinkChanged}
      />

      <DetailSection
        title="Customer Information"
        icon={User}
        tint="var(--chart-1)"
      >
        <DetailGrid>
          <DetailField label="Customer Name" value={toTitleCase(customer.name)} />
          <DetailField label="Phone" value={customer.phone} />
          <DetailField label="Alternate Phone" value={customer.altPhone} />
          <DetailField label="Email" value={customer.email} />
          <DetailField label="GST Number" value={customer.gstNumber} />
          <DetailField label="Customer Type" value={customer.customerType} />
        </DetailGrid>
      </DetailSection>

      {hasAddress ? (
        <DetailSection
          title="Address"
          description="Where this customer is based."
          icon={MapPin}
          tint="var(--chart-3)"
        >
          <DetailGrid>
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
            value={customer.openingBalance !== 0 ? money(customer.openingBalance) : undefined}
          />
          <DetailField
            label="Current Balance"
            value={
              customer.pendingAmount ? (
                <span className="text-red-600">{customer.pendingAmount}</span>
              ) : (
                customer.pendingAmount
              )
            }
          />
          <DetailField label="Balance Type" value={customer.balanceType} />
          <DetailField label="Last Purchase" value={customer.lastPurchaseDate} />
          <DetailField label="Last Payment" value={customer.lastPaymentDate} />
        </DetailGrid>
      </DetailSection>
      ) : null}
    </div>
  )
}
