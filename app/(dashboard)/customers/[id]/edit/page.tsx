import { notFound } from "next/navigation"

import { getCustomerById } from "@/lib/actions/customer-actions"
import { getStates } from "@/lib/actions/location-actions"
import { safeReturnTo } from "@/lib/safe-return-to"

import { CustomerEditForm } from "@/components/customers/customer-edit-form"
import { PageBackHeader } from "@/components/shared/page-back-header"

type EditCustomerPageProps = {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ returnTo?: string }>
}

export default async function EditCustomerPage({
  params,
  searchParams,
}: EditCustomerPageProps) {
  const { id } = await params
  const query = (await searchParams) ?? {}
  const returnTo = safeReturnTo(query.returnTo)

  const [customer, states] = await Promise.all([
    getCustomerById(id),
    getStates(),
  ])

  if (!customer) notFound()

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={`Edit ${customer.name}`}
        description="Update this customer's contact and account details."
        backHref={returnTo ?? "/customers"}
        backLabel={returnTo ? "Back without saving" : "Back to Customers"}
      />

      <CustomerEditForm customer={customer} states={states} returnTo={returnTo} />
    </main>
  )
}
