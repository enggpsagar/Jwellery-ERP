// app/vendors/[id]/page.tsx
import { notFound } from "next/navigation"

import { getVendorById } from "@/lib/actions/vendor-actions"
import { getStates } from "@/lib/actions/location-actions"
import { VendorRowActions } from "@/components/vendors/vendor-row-actions"
import { VendorLedgerCard } from "@/components/vendors/ledger/vendor-ledger-card"

type VendorDetailsPageProps = {
  params: Promise<{
    id: string
  }>
}

function DetailItem({
  label,
  value,
}: {
  label: string
  value?: string | number | null
}) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-gray-900">
        {value !== undefined && value !== null && value !== "" ? value : "-"}
      </p>
    </div>
  )
}

export default async function VendorDetailsPage({
  params,
}: VendorDetailsPageProps) {
  const { id } = await params

  const [vendor, states] = await Promise.all([
    getVendorById(id),
    getStates(),
  ])

  if (!vendor) {
    notFound()
  }

  return (
    <main className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-xl border bg-white p-6 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {vendor.name}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Vendor details and account information
          </p>
        </div>

        <VendorRowActions vendor={vendor} states={states} />
      </div>

      {/* Vendor Details */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Vendor Information
          </h2>
          <p className="text-sm text-gray-500">
            Complete profile information of this vendor.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <DetailItem label="Vendor Name" value={vendor.name} />
          <DetailItem label="Phone" value={vendor.phone} />
          <DetailItem label="Alternate Phone" value={vendor.altPhone} />
          <DetailItem label="Email" value={vendor.email} />
          <DetailItem label="City" value={vendor.city} />
          <DetailItem label="State" value={vendor.state} />
          <DetailItem label="Pincode" value={vendor.pincode} />
          <DetailItem label="GST Number" value={vendor.gstNumber} />
          <DetailItem
            label="Opening Balance"
            value={`₹ ${Number(vendor.openingBalance || 0).toLocaleString(
              "en-IN"
            )}`}
          />
          <DetailItem label="Current Balance" value={vendor.pendingAmount} />
          <DetailItem
            label="Last Purchase Date"
            value={vendor.lastPurchaseDate}
          />
          <DetailItem
            label="Last Payment Date"
            value={vendor.lastPaymentDate}
          />
        </div>
      </section>

      {/* Address + Notes */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Address</h2>
          <p className="mt-3 whitespace-pre-line text-sm text-gray-700">
            {vendor.address || "-"}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Notes</h2>
          <p className="mt-3 whitespace-pre-line text-sm text-gray-700">
            {vendor.notes || "-"}
          </p>
        </div>
      </section>

      {/* Business Summary */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Business Summary
          </h2>
          <p className="text-sm text-gray-500">
            Order and financial summary for this vendor.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DetailItem label="Total Orders" value={vendor.totalOrders ?? 0} />
          <DetailItem
            label="Total Purchase Value"
            value={vendor.totalPurchaseValue ?? "₹ 0"}
          />
          <DetailItem
            label="Pending Amount"
            value={vendor.pendingAmount ?? "₹ 0"}
          />
          <DetailItem
            label="Balance Type"
            value={vendor.balanceType ?? "-"}
          />
        </div>
      </section>

      {/* Ledger Section */}
      <VendorLedgerCard vendorId={vendor.id} />
    </main>
  )
}
