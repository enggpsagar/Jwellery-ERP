import { redirect } from "next/navigation"

/**
 * There is no separate Suppliers list any more (user decision 2026-10-13):
 * every party — bought from, sold to, or both — is one Party with one
 * ledger and one net balance, on /customers. Old bookmarks and links land
 * there.
 */
export default function SuppliersPage() {
  redirect("/customers")
}
