import { CreateStoreForm } from "@/components/stores/create-store-form"
import { PageBackHeader } from "@/components/shared/page-back-header"

export default function NewStorePage() {
  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Create Store"
        description="Set up a new store and its admin."
        backHref="/stores"
        backLabel="Back to Stores"
      />

      <CreateStoreForm />
    </main>
  )
}
