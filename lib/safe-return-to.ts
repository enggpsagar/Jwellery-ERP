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
