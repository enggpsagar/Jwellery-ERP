import type { Metadata } from "next"
import { cache } from "react"
import { notFound } from "next/navigation"

import { getStoreById } from "@/lib/actions/store-actions"
import { EditStoreForm } from "@/components/stores/edit-store-form"
import { PageBackHeader } from "@/components/shared/page-back-header"

type EditStorePageProps = {
  params: Promise<{ id: string }>
}

const getStore = cache(getStoreById)

export async function generateMetadata({
  params,
}: EditStorePageProps): Promise<Metadata> {
  try {
    const { id } = await params
    const store = await getStore(id)
    return { title: store ? `Edit ${store.name}` : "Edit Store" }
  } catch {
    return { title: "Edit Store" }
  }
}

export default async function EditStorePage({ params }: EditStorePageProps) {
  const { id } = await params
  const store = await getStore(id)

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
