import type { Metadata } from "next"
import { cache } from "react"
import { notFound } from "next/navigation"

import { getCustomerById } from "@/lib/actions/customer-actions"
import { getStates } from "@/lib/actions/location-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { safeReturnTo } from "@/lib/safe-return-to"

import { CustomerEditForm } from "@/components/customers/customer-edit-form"
import { CustomerVendorLinkCard } from "@/components/customers/customer-vendor-link-card"
import { PageBackHeader } from "@/components/shared/page-back-header"

type EditCustomerPageProps = {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ returnTo?: string }>
}

const getCustomer = cache(getCustomerById)

export async function generateMetadata({
  params,
}: EditCustomerPageProps): Promise<Metadata> {
  try {
    const { id } = await params
    const customer = await getCustomer(id)
    return { title: customer ? `Edit ${customer.name}` : "Edit Party" }
  } catch {
    return { title: "Edit Party" }
  }
}

export default async function EditCustomerPage({
  params,
  searchParams,
}: EditCustomerPageProps) {
  const { id } = await params
  const query = (await searchParams) ?? {}
  const returnTo = safeReturnTo(query.returnTo)

  const [customer, states, businessSettings] = await Promise.all([
    getCustomer(id),
    getStates(),
    getBusinessSettings(),
  ])

  if (!customer) notFound()

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <PageBackHeader
        title={`Edit ${customer.name}`}
        description="Update this party's contact and account details."
        backHref={returnTo ?? "/customers"}
        backLabel={returnTo ? "Back without saving" : "Back to Parties"}
      />

      {/* Same "is this customer also a vendor" card the detail page shows —
          previously only visible on /customers/[id], so a linked vendor
          silently disappeared from view the moment you opened Edit. */}
      <CustomerVendorLinkCard
        customerId={customer.id}
        linkedVendor={customer.linkedVendor ?? null}
      />

      <CustomerEditForm
        customer={customer}
        states={states}
        returnTo={returnTo}
        gstScheme={businessSettings.gstScheme}
      />
    </main>
  )
}
