// app/customers/[id]/page.tsx
import type { Metadata } from "next"
import { cache } from "react"
import { notFound } from "next/navigation"

import { getCustomerById } from "@/lib/actions/customer-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { resolveBackLink } from "@/lib/safe-return-to"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { getStates } from "@/lib/actions/location-actions"
import { CustomerRowActions } from "@/components/customers/customer-row-actions"
import { CustomerDetailContent } from "@/components/customers/customer-detail-content"
import { CustomerLedgerCard } from "@/components/customers/ledger/customer-ledger-card"
import { SupplierLedgerCard } from "@/components/customers/ledger/supplier-ledger-card"
import { toTitleCase } from "@/lib/utils"

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
    return { title: customer?.name ?? "Party" }
  } catch {
    return { title: "Party" }
  }
}

export default async function CustomerDetailsPage({
  params,
  searchParams,
}: CustomerDetailsPageProps) {
  const { id } = await params
  const backTo = resolveBackLink((await searchParams)?.from, {
    href: "/customers",
    label: "Back to Parties",
  })

  const [customer, states, businessSettings] = await Promise.all([
    getCustomer(id),
    getStates(),
    getBusinessSettings(),
  ])

  if (!customer) {
    notFound()
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <PageBackHeader
        title={toTitleCase(customer.name)}
        description="Party details and account information"
        backHref={backTo.href}
        backLabel={backTo.label}
        action={<CustomerRowActions customer={customer} states={states} />}
      />

      <CustomerDetailContent
        customer={customer}
        states={states}
        supplierModuleEnabled={businessSettings.supplierModuleEnabled}
        ledger={
          <CustomerLedgerCard
            customerId={customer.id}
            hasEmail={Boolean(customer.email)}
          />
        }
        supplierLedger={<SupplierLedgerCard customerId={customer.id} />}
      />
    </main>
  )
}
