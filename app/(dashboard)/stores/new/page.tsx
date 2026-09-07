import type { Metadata } from "next"

import { CreateStoreForm } from "@/components/stores/create-store-form"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { ResetFormWrapper } from "@/components/shared/reset-form-wrapper"
import { getPlans } from "@/lib/actions/plan-actions"

export const metadata: Metadata = {
  title: "Add Store",
}

export default async function NewStorePage() {
  const plans = await getPlans({ activeOnly: true })

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <PageBackHeader
        title="Create Store"
        description="Set up a new store and its admin."
        backHref="/stores"
        backLabel="Back to Stores"
      />

      <ResetFormWrapper>
        <CreateStoreForm plans={plans} />
      </ResetFormWrapper>
    </main>
  )
}
