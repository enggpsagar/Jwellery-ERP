import { notFound } from "next/navigation"

import { getStoreById } from "@/lib/actions/store-actions"
import { EditStoreForm } from "@/components/stores/edit-store-form"
import { PageBackHeader } from "@/components/shared/page-back-header"

type EditStorePageProps = {
  params: Promise<{ id: string }>
}

export default async function EditStorePage({ params }: EditStorePageProps) {
  const { id } = await params
  const store = await getStoreById(id)

  if (!store) {
    notFound()
  }

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Edit Store"
        description={`Update details for ${store.name}.`}
        backHref="/stores"
        backLabel="Back to Stores"
      />

      <EditStoreForm store={store} />
    </main>
  )
}
