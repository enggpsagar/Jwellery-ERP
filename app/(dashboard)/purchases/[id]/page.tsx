import type { Metadata } from "next"
import { cache } from "react"
import { notFound } from "next/navigation"

import { getPurchaseById } from "@/lib/actions/purchase-actions"
import { getStoreLocations } from "@/lib/actions/store-location-actions"
import { PurchaseDetailContent } from "@/components/purchases/purchase-detail-content"
import { PurchaseRowActions } from "@/components/purchases/purchase-row-actions"
import { RecordPurchasePaymentDialog } from "@/components/purchases/record-purchase-payment-dialog"
import { PageBackHeader } from "@/components/shared/page-back-header"

type Props = {
  params: Promise<{ id: string }>
}

const getPurchase = cache(getPurchaseById)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params
    const purchase = await getPurchase(id)
    return { title: purchase?.purchaseNumber ?? "Purchase" }
  } catch {
    return { title: "Purchase" }
  }
}

export default async function PurchaseDetailPage({ params }: Props) {
  const { id } = await params
  const [purchase, locations] = await Promise.all([getPurchase(id), getStoreLocations()])

  if (!purchase) notFound()

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <PageBackHeader
        title={purchase.purchaseNumber}
        description={purchase.vendor?.name ?? ""}
        backHref="/purchases"
        backLabel="Back to Purchases"
        action={
          <div className="flex items-center gap-2">
            <RecordPurchasePaymentDialog
              purchaseId={purchase.id}
              balanceAmount={purchase.balanceAmount}
            />
            <PurchaseRowActions purchase={purchase} locations={locations} />
          </div>
        }
      />

      <PurchaseDetailContent purchase={purchase} />
    </main>
  )
}
