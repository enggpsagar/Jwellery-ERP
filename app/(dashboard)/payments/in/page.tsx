import type { Metadata } from "next"

import { getPaymentsIn, getPaymentFormCustomersWithBalance } from "@/lib/actions/payments-actions"

import { PageBackHeader } from "@/components/shared/page-back-header"
import { PaymentInDialog } from "@/components/payments/payment-in-dialog"
import { PaymentsInTable } from "@/components/payments/payments-in-table"

export const metadata: Metadata = {
  title: "Payment In",
}

export const dynamic = "force-dynamic"

export default async function PaymentInPage() {
  const [rows, customers] = await Promise.all([getPaymentsIn(), getPaymentFormCustomersWithBalance()])

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Payment In"
        description="Every payment received from a party — from an invoice, an Estimate, or recorded here directly."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
        action={<PaymentInDialog customers={customers} />}
      />

      <PaymentsInTable rows={rows} />
    </main>
  )
}
