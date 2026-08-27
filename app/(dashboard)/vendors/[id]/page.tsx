// app/vendors/[id]/page.tsx
import { notFound } from "next/navigation"
import { IndianRupee, MapPin, Truck } from "lucide-react"

import { getVendorById } from "@/lib/actions/vendor-actions"
import { getStates } from "@/lib/actions/location-actions"
import { resolveBackLink } from "@/lib/safe-return-to"
import { PageBackHeader } from "@/components/shared/page-back-header"
import {
  DetailField,
  DetailGrid,
  DetailSection,
} from "@/components/shared/detail-section"
import { VendorRowActions } from "@/components/vendors/vendor-row-actions"
import { VendorLedgerCard } from "@/components/vendors/ledger/vendor-ledger-card"

type VendorDetailsPageProps = {
  params: Promise<{
    id: string
  }>
  searchParams?: Promise<{ from?: string }>
}

export default async function VendorDetailsPage({
  params,
  searchParams,
}: VendorDetailsPageProps) {
  const { id } = await params
  const backTo = resolveBackLink((await searchParams)?.from, {
    href: "/vendors",
    label: "Back to Vendors",
  })

  const [vendor, states] = await Promise.all([getVendorById(id), getStates()])

  if (!vendor) {
    notFound()
  }

  const money = (value: unknown) =>
    `₹ ${Number(value || 0).toLocaleString("en-IN")}`

  return (
    <main className="space-y-6 p-6">
      {/* This page had no back link at all — the only way out was the sidebar. */}
      <PageBackHeader
        title={vendor.name}
        description="Vendor details and account information"
        backHref={backTo.href}
        backLabel={backTo.label}
        action={<VendorRowActions vendor={vendor} states={states} />}
      />

      <DetailSection
        title="Vendor Information"
        description="Contact details and identifiers."
        icon={Truck}
        tint="var(--chart-1)"
      >
        <DetailGrid>
          <DetailField label="Vendor Name" value={vendor.name} />
          <DetailField label="Phone" value={vendor.phone} />
          <DetailField label="Alternate Phone" value={vendor.altPhone} />
          <DetailField label="Email" value={vendor.email} />
          <DetailField label="GST Number" value={vendor.gstNumber} />
        </DetailGrid>
      </DetailSection>

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

      <DetailSection
        title="Business Summary"
        description="Purchase and payment summary for this vendor."
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
            value={money(vendor.openingBalance)}
          />
          <DetailField label="Current Balance" value={vendor.pendingAmount} />
          <DetailField label="Balance Type" value={vendor.balanceType} />
          <DetailField label="Last Purchase" value={vendor.lastPurchaseDate} />
          <DetailField label="Last Payment" value={vendor.lastPaymentDate} />
        </DetailGrid>
      </DetailSection>

      <VendorLedgerCard vendorId={vendor.id} />
    </main>
  )
}
