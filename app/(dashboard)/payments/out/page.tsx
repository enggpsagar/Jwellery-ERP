import type { Metadata } from "next"

import { getPaymentsOut, getPaymentFormKarigars } from "@/lib/actions/payments-actions"
import { getPurchaseFormVendors } from "@/lib/actions/purchase-actions"

import { PageBackHeader } from "@/components/shared/page-back-header"
import { PaymentOutDialog } from "@/components/payments/payment-out-dialog"
import { PaymentsOutTable } from "@/components/payments/payments-out-table"

export const metadata: Metadata = {
  title: "Payment Out",
}

export const dynamic = "force-dynamic"

export default async function PaymentOutPage() {
  const [rows, vendors, karigars] = await Promise.all([
    getPaymentsOut(),
    getPurchaseFormVendors(),
    getPaymentFormKarigars(),
  ])

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Payment Out"
        description="Every payment made to a vendor or artisan — from a purchase bill, an artisan's own payment action, or recorded here directly."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
        action={<PaymentOutDialog vendors={vendors} karigars={karigars} />}
      />

      <PaymentsOutTable rows={rows} />
    </main>
  )
}
