// app/customers/[id]/page.tsx
import { notFound } from "next/navigation"

import { getCustomerById } from "@/lib/actions/customer-actions"
import { safeReturnTo } from "@/lib/safe-return-to"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { getStates } from "@/lib/actions/location-actions"
import { CustomerRowActions } from "@/components/customers/customer-row-actions"
import { CustomerLedgerCard } from "@/components/customers/ledger/customer-ledger-card"

type CustomerDetailsPageProps = {
  params: Promise<{
    id: string
  }>
  searchParams?: Promise<{ from?: string }>
}

/**
 * Where "back" goes. Customers are reached from several places — the
 * Customers list, an invoice, a kacha slip — and landing here used to be a
 * dead end with no way back at all. Callers pass `?from=<path>`.
 *
 * The label is derived from a fixed set of known paths rather than taken
 * from the query string, so nothing a caller puts in the URL can be
 * rendered as text. `safeReturnTo` separately keeps the href same-origin.
 */
function resolveBackTo(from: string | undefined) {
  const href = safeReturnTo(from)

  if (!href) return { href: "/customers", label: "Back to Customers" }

  if (href === "/billing") return { href, label: "Back to Invoices" }
  if (href === "/billing/kacha") return { href, label: "Back to Kacha Slips" }
  if (href.startsWith("/billing/kacha/")) return { href, label: "Back to Kacha Slip" }
  if (href.startsWith("/billing/")) return { href, label: "Back to Invoice" }
  if (href.startsWith("/quotations")) return { href, label: "Back to Quotation" }
  if (href.startsWith("/ledger")) return { href, label: "Back to Ledger" }

  return { href, label: "Back" }
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

export default async function CustomerDetailsPage({
  params,
  searchParams,
}: CustomerDetailsPageProps) {
  const { id } = await params
  const backTo = resolveBackTo((await searchParams)?.from)

  const [customer, states] = await Promise.all([
    getCustomerById(id),
    getStates(),
  ])

  if (!customer) {
    notFound()
  }

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={customer.name}
        description="Customer details and account information"
        backHref={backTo.href}
        backLabel={backTo.label}
        action={<CustomerRowActions customer={customer} states={states} />}
      />

      {/* Customer Details */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Customer Information
          </h2>
          <p className="text-sm text-gray-500">
            Complete profile information of this customer.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <DetailItem label="Customer Name" value={customer.name} />
          <DetailItem label="Phone" value={customer.phone} />
          <DetailItem label="Alternate Phone" value={customer.altPhone} />
          <DetailItem label="Email" value={customer.email} />
          <DetailItem label="City" value={customer.city} />
          <DetailItem label="State" value={customer.state} />
          <DetailItem label="Pincode" value={customer.pincode} />
          <DetailItem label="GST Number" value={customer.gstNumber} />
          <DetailItem
            label="Opening Balance"
            value={`₹ ${Number(customer.openingBalance || 0).toLocaleString(
              "en-IN"
            )}`}
          />
          <DetailItem label="Current Balance" value={customer.pendingAmount} />
          <DetailItem
            label="Last Purchase Date"
            value={customer.lastPurchaseDate}
          />
          <DetailItem
            label="Last Payment Date"
            value={customer.lastPaymentDate}
          />
        </div>
      </section>

      {/* Address + Notes */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Address</h2>
          <p className="mt-3 whitespace-pre-line text-sm text-gray-700">
            {customer.address || "-"}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Notes</h2>
          <p className="mt-3 whitespace-pre-line text-sm text-gray-700">
            {customer.notes || "-"}
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
            Order and financial summary for this customer.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DetailItem label="Total Orders" value={customer.totalOrders ?? 0} />
          <DetailItem
            label="Total Purchase Value"
            value={customer.totalPurchaseValue ?? "₹ 0"}
          />
          <DetailItem
            label="Pending Amount"
            value={customer.pendingAmount ?? "₹ 0"}
          />
          <DetailItem
            label="Balance Type"
            value={customer.balanceType ?? "-"}
          />
        </div>
      </section>

      {/* Ledger Section */}
      <CustomerLedgerCard customerId={customer.id} />
    </main>
  )
}