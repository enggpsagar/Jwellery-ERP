import { IndianRupee, MapPin, Truck } from "lucide-react"

import type { Vendor } from "@/lib/actions/vendor-actions"
import { toTitleCase } from "@/lib/utils"
import {
  DetailField,
  DetailGrid,
  DetailSection,
} from "@/components/shared/detail-section"
import { VendorCustomerLinkCard } from "@/components/vendors/vendor-customer-link-card"

/**
 * The body of a vendor's detail view — Vendor Information / Address /
 * Business Summary / Ledger. Shared between the standalone /vendors/[id]
 * page and the inline detail pane on the Vendors list itself, so the two
 * can never drift apart.
 *
 * The ledger itself is a caller-supplied slot rather than rendered inline:
 * the standalone page's ledger is server-fetched, the inline panel's is a
 * client-fetched twin (a server component can't be reached from a client
 * component by import), and this shared body has no reason to know which.
 */
export function VendorDetailContent({
  vendor,
  ledger,
  onLinkChanged,
}: {
  vendor: Vendor
  ledger: React.ReactNode
  /** See VendorCustomerLinkCard's own doc comment on its onChanged prop. */
  onLinkChanged?: () => void
}) {
  const money = (value: unknown) => `₹ ${Number(value || 0).toLocaleString("en-IN")}`

  // Hidden entirely when there's nothing to show — an "Address" card with
  // every field blank is an empty box, not information.
  const hasAddress = Boolean(
    vendor.city || vendor.state || vendor.pincode || vendor.address || vendor.notes,
  )

  // Hidden entirely when there's nothing to summarize — same rule as the
  // Customer detail page's Business Summary.
  const hasBusinessSummary = (vendor.totalOrders ?? 0) > 0 || vendor.openingBalance !== 0

  return (
    <div className="space-y-6">
      {/* Ledger first — same reasoning as the Customer detail page: the
          financial history is why this page gets opened day to day, not
          the contact-card details below it. Renders nothing when this
          vendor has no ledger activity yet (see VendorLedgerBody). Stays
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
        <VendorCustomerLinkCard
          vendorId={vendor.id}
          linkedCustomer={vendor.linkedCustomer ?? null}
          onChanged={onLinkChanged}
        />

        <DetailSection
          title="Vendor Information"
          icon={Truck}
          tint="var(--chart-1)"
        >
          <DetailGrid>
            <DetailField label="Phone" value={vendor.phone} />
            <DetailField label="Alternate Phone" value={vendor.altPhone} />
            <DetailField label="Email" value={vendor.email} />
            <DetailField label="GST Number" value={vendor.gstNumber} />
          </DetailGrid>
        </DetailSection>

        {hasAddress ? (
          <DetailSection
            title="Address"
            description="Where this vendor is based."
            icon={MapPin}
            tint="var(--chart-3)"
          >
            <DetailGrid>
              <DetailField label="City" value={vendor.city} />
              <DetailField label="State" value={vendor.state} />
              <DetailField label="Pincode" value={vendor.pincode} />
              <DetailField
                label="Full Address"
                span
                value={
                  vendor.address ? (
                    <span className="whitespace-pre-line">{vendor.address}</span>
                  ) : null
                }
              />
              <DetailField
                label="Notes"
                span
                value={
                  vendor.notes ? (
                    <span className="whitespace-pre-line">{vendor.notes}</span>
                  ) : null
                }
              />
            </DetailGrid>
          </DetailSection>
        ) : null}

        {hasBusinessSummary ? (
          <DetailSection
            title="Business Summary"
            icon={IndianRupee}
            tint="var(--chart-2)"
          >
            <DetailGrid>
              <DetailField label="Total Orders" value={vendor.totalOrders ?? 0} />
              <DetailField
                label="Total Purchase Value"
                value={vendor.totalPurchaseValue ?? money(0)}
              />
              <DetailField
                label="Opening Balance"
                value={vendor.openingBalance !== 0 ? money(vendor.openingBalance) : undefined}
              />
              <DetailField
                label="Current Balance"
                value={
                  // Was `money(vendor.currentBalance)` verbatim — for a
                  // negative balance (we've paid this vendor more than
                  // they've billed us, an advance) that rendered as the
                  // confusing "₹ -36,000" in the same red used for money
                  // owed, when a negative balance here means the opposite.
                  vendor.balanceType === "Advance" ? (
                    <span className="text-blue-600">{money(Math.abs(vendor.currentBalance ?? 0))} Advance</span>
                  ) : vendor.currentBalance ? (
                    <span className="text-red-600">{money(vendor.currentBalance)}</span>
                  ) : (
                    money(0)
                  )
                }
              />
              <DetailField label="Balance Type" value={vendor.balanceType} />
              <DetailField label="Last Purchase" value={vendor.lastPurchaseDate} />
              <DetailField label="Last Payment" value={vendor.lastPaymentDate} />
            </DetailGrid>
          </DetailSection>
        ) : null}
      </div>
    </div>
  )
}
