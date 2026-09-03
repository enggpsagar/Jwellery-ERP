import type { Metadata } from "next"

import { getStates } from "@/lib/actions/location-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { safeReturnTo } from "@/lib/safe-return-to"

import { VendorCreateForm } from "@/components/vendors/vendor-create-form"
import { PageBackHeader } from "@/components/shared/page-back-header"

export const metadata: Metadata = {
  title: "Add Vendor",
}

type NewVendorPageProps = {
  searchParams?: Promise<{ returnTo?: string }>
}

export default async function NewVendorPage({ searchParams }: NewVendorPageProps) {
  const params = (await searchParams) ?? {}
  const returnTo = safeReturnTo(params.returnTo)

  const [states, businessSettings] = await Promise.all([getStates(), getBusinessSettings()])

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Add Vendor"
        description="Create a new vendor you buy stock from."
        backHref={returnTo ?? "/vendors"}
        backLabel={returnTo ? "Back without saving" : "Back to Vendors"}
      />

      <VendorCreateForm states={states} returnTo={returnTo} gstScheme={businessSettings.gstScheme} />
    </main>
  )
}
