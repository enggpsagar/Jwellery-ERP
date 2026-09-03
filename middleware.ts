import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { MODULE_DEFINITIONS } from "@/lib/roles";

const KARIGAR_ALLOWED_PREFIXES = ["/my-jobs", "/profile", "/contact-faq"];

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

  const role = token.role as string | undefined;

  if (pathname.startsWith("/stores") && role !== "SUPER_ADMIN") {
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

  return NextResponse.next();
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
