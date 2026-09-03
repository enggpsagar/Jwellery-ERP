import sanitizeHtml from "sanitize-html";

/**
 * The exact tag set components/shared/rich-text-editor.tsx's TipTap
 * StarterKit (heading disabled) can produce from its own toolbar
 * (bold/italic/lists) plus the handful of other StarterKit nodes/marks a
 * keyboard shortcut can still reach (blockquote, code, strike, hr) — no
 * attributes are ever needed for any of them (no `<a href>`, no
 * `<img src>`), so allowedAttributes is empty rather than trying to
 * allowlist "safe" attribute values.
 */
const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "s",
  "strike",
  "hr",
];

/**
 * Sanitizes TipTap-authored HTML that a genuinely untrusted party can
 * submit — a support ticket's message/reply body, reachable from the
 * public, unauthenticated Contact Us form, unlike every other HTML field
 * this app stores (Contact Us content, FAQ answers), which is SUPER_ADMIN
 * -only and therefore rendered unsanitized elsewhere in this codebase (see
 * components/public/contact-content-view.tsx's own comment on why). A
 * ticket message renders via dangerouslySetInnerHTML in front of a
 * SUPER_ADMIN and the submitter both, and the raw FormData a browser posts
 * can be bypassed entirely by anyone willing to script a request directly
 * at the server action — the client-side editor's own tag whitelist is not
 * a security boundary. Sanitize once, on write (here), rather than at every
 * render site, so a stored row is safe by construction and nothing can
 * forget to re-sanitize it later.
 *
 * Uses `sanitize-html` (pure JS, htmlparser2-based) rather than DOMPurify —
 * DOMPurify's Node build depends on jsdom, which pulls in an ESM-only
 * transitive dependency (@exodus/bytes, via html-encoding-sniffer) that
 * Vercel's Turbopack production bundling cannot require() — this crashed
 * every page that imported this module in production
 * (ERR_REQUIRE_ESM, "Failed to load external module jsdom-...") despite
 * building and running cleanly in every local check. sanitize-html has no
 * such dependency and is a standard, widely-used server-side sanitizer for
 * exactly this use case.
 */
export function sanitizeTicketHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {},
  });
}
