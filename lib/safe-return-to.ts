/**
 * Sanitises a `returnTo` query param before it is used to redirect.
 *
 * Only same-origin paths are allowed. Anything else — an absolute URL, a
 * protocol-relative `//evil.com` (which browsers treat as absolute), or a
 * scheme like `javascript:` — is dropped, so a crafted link can't turn one
 * of our own "create X, then come back" flows into an open redirect.
 */
export function safeReturnTo(value: string | null | undefined): string | undefined {
  if (!value) return undefined

  const path = value.trim()

  // Must be rooted, and must not begin a protocol-relative URL.
  if (!path.startsWith("/") || path.startsWith("//")) return undefined

  // Backslashes get normalised to forward slashes by some browsers, so
  // "/\evil.com" can escape the origin too.
  if (path.includes("\\")) return undefined

  return path
}

/**
 * Resolves the "back" target for a detail page reached from several places.
 * Callers pass `?from=<path>`; anything not same-origin falls back.
 *
 * The label is chosen by matching the path against a fixed list rather than
 * taken from the query string, so nothing a caller puts in the URL can be
 * rendered as text. `safeReturnTo` separately keeps the href same-origin.
 */
export function resolveBackLink(
  from: string | undefined,
  fallback: { href: string; label: string },
): { href: string; label: string } {
  const href = safeReturnTo(from)

  if (!href) return fallback

  if (href === "/billing") return { href, label: "Back to Invoices" }
  if (href === "/billing/kacha") return { href, label: "Back to Kacha Slips" }
  if (href.startsWith("/billing/kacha/")) return { href, label: "Back to Kacha Slip" }
  if (href.startsWith("/billing/")) return { href, label: "Back to Invoice" }
  if (href === "/inventory/stock") return { href, label: "Back to Stock" }
  if (href.startsWith("/inventory/stock/")) return { href, label: "Back to Stock Item" }
  if (href === "/inventory/products") return { href, label: "Back to Products" }
  if (href.startsWith("/purchases")) return { href, label: "Back to Purchase" }
  if (href.startsWith("/quotations")) return { href, label: "Back to Quotation" }
  if (href.startsWith("/ledger")) return { href, label: "Back to Ledger" }
  if (href.startsWith("/customers")) return { href, label: "Back to Customers" }
  if (href.startsWith("/reports")) return { href, label: "Back to Reports" }

  return { href, label: "Back" }
}
