// lib/constants/customer-ledger.ts
import type { CustomerLedgerFormState } from "@/lib/actions/customer-ledger-actions"

export const initialLedgerState: CustomerLedgerFormState = {
  success: false,
  message: "",
  errors: {},
}