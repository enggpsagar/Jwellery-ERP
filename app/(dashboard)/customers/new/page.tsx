import type { Metadata } from "next"

import { getStates } from "@/lib/actions/location-actions"
import { safeReturnTo } from "@/lib/safe-return-to"
import { getBusinessSettings } from "@/lib/actions/settings-actions"

import { CustomerCreateForm } from "@/components/customers/customer-create-form"
import { ResetFormWrapper } from "@/components/shared/reset-form-wrapper"

export const metadata: Metadata = {
  title: "Add Party",
}

type NewCustomerPageProps = {
  searchParams?: Promise<{ returnTo?: string; markAsSupplier?: string }>
}

export default async function NewCustomerPage({
  searchParams,
}: NewCustomerPageProps) {
  const params = (await searchParams) ?? {}
  const returnTo = safeReturnTo(params.returnTo)
  // Set only by the Suppliers page's own "Add Supplier" link — see
  // CustomerCreateForm's own doc comment on why this is a follow-up call
  // rather than a field on this form.
  const markAsSupplier = params.markAsSupplier === "1"

  const [states, settings] = await Promise.all([getStates(), getBusinessSettings()])

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <ResetFormWrapper
        header={{
          title: markAsSupplier ? "Add Supplier" : "Add Party",
          description: markAsSupplier
            ? "Create a new party you buy from."
            : "Create a new party you sell to.",
          backHref: returnTo ?? "/customers",
          backLabel: returnTo ? "Back without saving" : "Back to Parties",
        }}
      >
        <CustomerCreateForm
          states={states}
          returnTo={returnTo}
          markAsSupplier={markAsSupplier}
          gstScheme={settings.gstScheme}
          defaultState={settings.state}
          defaultCity={settings.city}
        />
      </ResetFormWrapper>
    </main>
  )
}
