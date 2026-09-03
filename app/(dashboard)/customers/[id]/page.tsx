// app/customers/[id]/page.tsx
import type { Metadata } from "next"
import { cache } from "react"
import { notFound } from "next/navigation"
import { IndianRupee, MapPin, User } from "lucide-react"

import { getCustomerById } from "@/lib/actions/customer-actions"
import { resolveBackLink } from "@/lib/safe-return-to"
import { PageBackHeader } from "@/components/shared/page-back-header"
import {
  DetailField,
  DetailGrid,
  DetailSection,
} from "@/components/shared/detail-section"
import { getStates } from "@/lib/actions/location-actions"
import { CustomerRowActions } from "@/components/customers/customer-row-actions"
import { CustomerLedgerCard } from "@/components/customers/ledger/customer-ledger-card"

type CustomerDetailsPageProps = {
  params: Promise<{
    id: string
  }>
  searchParams?: Promise<{ from?: string }>
}

const getCustomer = cache(getCustomerById)

export async function generateMetadata({
  params,
}: CustomerDetailsPageProps): Promise<Metadata> {
  try {
    const { id } = await params
    const customer = await getCustomer(id)
    return { title: customer?.name ?? "Customer" }
  } catch {
    return { title: "Customer" }
  }
}

export default async function CustomerDetailsPage({
  params,
  searchParams,
}: CustomerDetailsPageProps) {
  const { id } = await params
  const backTo = resolveBackLink((await searchParams)?.from, {
    href: "/customers",
    label: "Back to Customers",
  })

  const [customer, states] = await Promise.all([
    getCustomer(id),
    getStates(),
  ])

  if (!customer) {
    notFound()
  }

  const money = (value: unknown) =>
    `₹ ${Number(value || 0).toLocaleString("en-IN")}`

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={customer.name}
        description="Customer details and account information"
        backHref={backTo.href}
        backLabel={backTo.label}
        action={<CustomerRowActions customer={customer} states={states} />}
      />

      <DetailSection
        title="Customer Information"
        description="Contact details and identifiers."
        icon={User}
        tint="var(--chart-1)"
      >
        <DetailGrid>
          <DetailField label="Customer Name" value={customer.name} />
          <DetailField label="Phone" value={customer.phone} />
          <DetailField label="Alternate Phone" value={customer.altPhone} />
          <DetailField label="Email" value={customer.email} />
          <DetailField label="GST Number" value={customer.gstNumber} />
          <DetailField label="Customer Type" value={customer.customerType} />
        </DetailGrid>
      </DetailSection>

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

      <DetailSection
        title="Business Summary"
        description="Order and financial summary for this customer."
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
            value={money(customer.openingBalance)}
          />
          <DetailField
            label="Current Balance"
            value={customer.pendingAmount}
          />
          <DetailField label="Balance Type" value={customer.balanceType} />
          <DetailField
            label="Last Purchase"
            value={customer.lastPurchaseDate}
          />
          <DetailField label="Last Payment" value={customer.lastPaymentDate} />
        </DetailGrid>
      </DetailSection>

      <CustomerLedgerCard customerId={customer.id} />
    </main>
  )
}
