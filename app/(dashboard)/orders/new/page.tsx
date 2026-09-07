import type { Metadata } from "next"

import { getQuotationFormCustomers } from "@/lib/actions/quotation-actions"
import { getStoreMetals } from "@/lib/actions/taxonomy-actions"
import { getStoreLocations, getDefaultLocationId } from "@/lib/actions/store-location-actions"

import { DraftOrderForm } from "@/components/orders/draft-order-form"
import { ResetFormWrapper } from "@/components/shared/reset-form-wrapper"

export const metadata: Metadata = {
  title: "New Draft Order",
}

export default async function NewDraftOrderPage() {
  const [customers, metals, locations, defaultLocationId] = await Promise.all([
    getQuotationFormCustomers(),
    getStoreMetals(),
    getStoreLocations(),
    getDefaultLocationId(),
  ])

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <ResetFormWrapper
        requireConfirm
        header={{
          title: "New Draft Order",
          description: "Capture a phone/counter order — what the party wants, before it exists as a real piece.",
          backHref: "/orders",
          backLabel: "Back to Draft Orders",
        }}
      >
        <DraftOrderForm
          customers={customers}
          metals={metals}
          locations={locations}
          defaultLocationId={defaultLocationId}
        />
      </ResetFormWrapper>
    </main>
  )
}
