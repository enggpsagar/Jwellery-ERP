import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { MODULE_DEFINITIONS } from "@/lib/roles";

const KARIGAR_ALLOWED_PREFIXES = ["/my-jobs", "/profile", "/contact-faq"];

/** Hard cutoff from sign-in, not an idle timeout — see token.loginAt's own
 *  doc comment in lib/auth/auth-options.ts for why this can't just be
 *  NextAuth's session.maxAge on its own. */
const SESSION_ABSOLUTE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Set by the jwt callback when a re-read finds the account deleted or
  // deactivated — someone who left a store keeps a valid-looking token until
  // it expires, so the flag is what actually ends their access.
  if (token.disabled === true) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Security requirement: a session must not outlive 24 hours from sign-in,
  // active or not. token.loginAt is stamped once at sign-in and never
  // refreshed, unlike the JWT's own `iat` claim (next-auth re-stamps that on
  // every token refresh) or session.maxAge alone (a sliding window that an
  // active user would never actually hit).
  const loginAt = typeof token.loginAt === "number" ? token.loginAt : undefined;
  if (loginAt && Date.now() - loginAt > SESSION_ABSOLUTE_MAX_AGE_MS) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    loginUrl.searchParams.set("error", "session_expired");
    return NextResponse.redirect(loginUrl);
  }

  const role = token.role as string | undefined;

  // Plan-expiry is deliberately NOT enforced here anymore. It was
  // originally (token.planExpired, redirecting on every request) — removed
  // once testing established two things: (1) it couldn't work as written,
  // since this app's SessionProvider disables both refetchOnWindowFocus
  // and refetchInterval (components/providers/session-provider.tsx), so
  // the JWT cookie this reads is never re-signed with a fresh value after
  // login; and (2) the actual, confirmed requirement is narrower than "log
  // the whole session out" anyway — viewing an expired store's existing
  // data should keep working, only new entries/updates/exports should be
  // blocked. Real-time enforcement for that now lives in
  // lib/store-context.ts's assertPlanActiveForMutation, called from
  // requireStoreScope()/resolveActingStoreId() and gated on the request
  // actually being a Server Action mutation (Next.js's own `Next-Action`
  // header), which a lightweight middleware token check can't distinguish
  // from a plain page view.

  if (pathname.startsWith("/stores") && role !== "SUPER_ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Settings (business profile, GST, purity, taxonomy, locations, API keys)
  // is Admin/Super Admin only — see the doc comment on SettingsPage's own
  // `canEdit` check, which only ever disabled editing and never actually
  // blocked read access for Manager/Staff, despite that being the intent.
  // The sidebar already hides this link for Staff/Karigar/Manager
  // (app-sidebar.tsx's `showSettings`), but the header's Account dropdown
  // linked to it unconditionally — this is the server-side gate that
  // actually stops those roles from reaching it, not just hiding the link.
  if (
    pathname.startsWith("/settings") &&
    role !== "ADMIN" &&
    role !== "SUPER_ADMIN"
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // The support ticket inbox is platform support, not a per-store feature —
  // same SUPER_ADMIN-only gate as /stores. Submitting a ticket and viewing
  // one's own (/contact-faq) stays open to every role; only the inbox that
  // sees every ticket across every store is restricted here.
  if (pathname.startsWith("/support-tickets") && role !== "SUPER_ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // The design-system reference (colors, components, established
  // conventions) is a platform-operator tool, not something a store's own
  // staff has a use for — same SUPER_ADMIN-only gate as /stores and /plans.
  if (pathname.startsWith("/brand-guide") && role !== "SUPER_ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (
    role === "KARIGAR" &&
    !KARIGAR_ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    return NextResponse.redirect(new URL("/my-jobs", request.url));
  }

  // Per-user module access — only Staff can be restricted; Admin/Super Admin
  // always have every module. An empty `permissions` array means "not
  // customized" (e.g. a legacy Staff account) and falls back to full
  // access, mirroring getEffectivePermissions() in lib/roles.ts — every
  // enforcement point must agree on this fallback or a legacy Staff user
  // would pass hasPermission() checks but get bounced here anyway.
  if (role === "STAFF") {
    const permissions = (token.permissions as string[] | undefined) ?? [];

    if (permissions.length > 0) {
      const module = MODULE_DEFINITIONS.find((definition) =>
        pathname.startsWith(definition.href)
      );

      if (module && !module.permissions.every((permission) => permissions.includes(permission))) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }
  }

  // Forwarded so app/(dashboard)/layout.tsx can tell which route is
  // rendering without a store selected — a Super Admin with no
  // Collaboration Code grants yet still needs /stores (to redeem one),
  // /profile, and /support-tickets to work normally, none of which depend
  // on requireStoreScope(); only store-scoped routes should show that
  // layout's "No store access yet" notice instead of crashing into it.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // `.+` rather than `.*` is what makes the landing page reachable: with
  // `.*` the capture can be empty, so "/" itself matched and every visitor
  // was redirected to /login before the page rendered. Requiring at least
  // one character after the slash leaves "/" public and protects everything
  // below it exactly as before.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|login|register|contact|faq).+)",
  ],
};
