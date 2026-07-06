// lib/customer-ledger/customer-ledger-form-state.ts
import type { CustomerLedgerFormState } from "@/lib/actions/customer-ledger-actions"

export const initialCustomerLedgerFormState: CustomerLedgerFormState = {
  success: false,
  message: "",
  errors: {},
}