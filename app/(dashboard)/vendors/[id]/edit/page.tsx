import { notFound } from "next/navigation"

import { getVendorById } from "@/lib/actions/vendor-actions"
import { getStates } from "@/lib/actions/location-actions"
import { safeReturnTo } from "@/lib/safe-return-to"

import { VendorEditForm } from "@/components/vendors/vendor-edit-form"
import { PageBackHeader } from "@/components/shared/page-back-header"

type EditVendorPageProps = {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ returnTo?: string }>
}

export default async function EditVendorPage({
  params,
  searchParams,
}: EditVendorPageProps) {
  const { id } = await params
  const query = (await searchParams) ?? {}
  const returnTo = safeReturnTo(query.returnTo)

  const [vendor, states] = await Promise.all([getVendorById(id), getStates()])

  if (!vendor) notFound()

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={`Edit ${vendor.name}`}
        description="Update this vendor's contact and account details."
        backHref={returnTo ?? "/vendors"}
        backLabel={returnTo ? "Back without saving" : "Back to Vendors"}
      />

      <VendorEditForm vendor={vendor} states={states} returnTo={returnTo} />
    </main>
  )
}
