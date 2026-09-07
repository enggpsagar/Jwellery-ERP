import type { Metadata } from "next"

import { getStates } from "@/lib/actions/location-actions"
import { safeReturnTo } from "@/lib/safe-return-to"
import { getBusinessSettings } from "@/lib/actions/settings-actions"

import { CustomerCreateForm } from "@/components/customers/customer-create-form"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { ResetFormWrapper } from "@/components/shared/reset-form-wrapper"

export const metadata: Metadata = {
  title: "Add Customer",
}

type NewCustomerPageProps = {
  searchParams?: Promise<{ returnTo?: string }>
}

export default async function NewCustomerPage({
  searchParams,
}: NewCustomerPageProps) {
  const params = (await searchParams) ?? {}
  const returnTo = safeReturnTo(params.returnTo)

  const [states, settings] = await Promise.all([getStates(), getBusinessSettings()])

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <PageBackHeader
        title="Add Customer"
        description="Create a new customer you sell to."
        backHref={returnTo ?? "/customers"}
        backLabel={returnTo ? "Back without saving" : "Back to Customers"}
      />

      <ResetFormWrapper>
        <CustomerCreateForm
          states={states}
          returnTo={returnTo}
          gstScheme={settings.gstScheme}
          defaultState={settings.state}
          defaultCity={settings.city}
        />
      </ResetFormWrapper>
    </main>
  )
}
