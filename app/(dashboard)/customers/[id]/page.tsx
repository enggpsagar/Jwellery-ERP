// app/customers/[id]/page.tsx
import type { Metadata } from "next"
import { cache } from "react"
import { notFound } from "next/navigation"

import { getCustomerById } from "@/lib/actions/customer-actions"
import { resolveBackLink } from "@/lib/safe-return-to"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { getStates } from "@/lib/actions/location-actions"
import { CustomerRowActions } from "@/components/customers/customer-row-actions"
import { CustomerDetailContent } from "@/components/customers/customer-detail-content"
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

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={customer.name}
        description="Customer details and account information"
        backHref={backTo.href}
        backLabel={backTo.label}
        action={<CustomerRowActions customer={customer} states={states} />}
      />

      <CustomerDetailContent
        customer={customer}
        states={states}
        ledger={<CustomerLedgerCard customerId={customer.id} />}
      />
    </main>
  )
}
