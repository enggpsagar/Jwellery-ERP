// app/vendors/[id]/page.tsx
import type { Metadata } from "next"
import { cache } from "react"
import { notFound, redirect } from "next/navigation"

import { getVendorById } from "@/lib/actions/vendor-actions"
import { getStates } from "@/lib/actions/location-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { resolveBackLink } from "@/lib/safe-return-to"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { VendorRowActions } from "@/components/vendors/vendor-row-actions"
import { VendorDetailContent } from "@/components/vendors/vendor-detail-content"
import { VendorLedgerCard } from "@/components/vendors/ledger/vendor-ledger-card"
import { toTitleCase } from "@/lib/utils"

type VendorDetailsPageProps = {
  params: Promise<{
    id: string
  }>
  searchParams?: Promise<{ from?: string }>
}

const getVendor = cache(getVendorById)

export async function generateMetadata({
  params,
}: VendorDetailsPageProps): Promise<Metadata> {
  try {
    const { id } = await params
    const vendor = await getVendor(id)
    return { title: vendor?.name ?? "Vendor" }
  } catch {
    return { title: "Vendor" }
  }
}

export default async function VendorDetailsPage({
  params,
  searchParams,
}: VendorDetailsPageProps) {
  const { id } = await params
  const backTo = resolveBackLink((await searchParams)?.from, {
    href: "/vendors",
    label: "Back to Vendors",
  })

  const [vendor, states, settings] = await Promise.all([getVendor(id), getStates(), getBusinessSettings()])

  // Module toggled off in Settings — this is the standalone vendor-
  // management detail page (ledger, stats, Register-as-Party card), not
  // needed for Purchases/Payment Out's own "pick a supplier" flow, so it's
  // gated the same as the list/archived/export pages.
  if (!settings.vendorsModuleEnabled) {
    redirect("/dashboard")
  }

  if (!vendor) {
    notFound()
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      {/* This page had no back link at all — the only way out was the sidebar. */}
      <PageBackHeader
        title={toTitleCase(vendor.name)}
        description="Vendor details and account information"
        backHref={backTo.href}
        backLabel={backTo.label}
        action={<VendorRowActions vendor={vendor} states={states} />}
      />

      <VendorDetailContent vendor={vendor} ledger={<VendorLedgerCard vendorId={vendor.id} />} />
    </main>
  )
}
