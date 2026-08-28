// app/s/[stockId]/route.ts

import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/auth";
import { listMemberships } from "@/lib/store-membership";
import { createQuickSaleToken } from "@/lib/quick-sale-token";

/**
 * The scan entry point. Every printed tag points here.
 *
 * This exists because a scan arrives with no application context: a phone
 * camera opens a bare URL, and the browser may last have had a different
 * store selected — or none. Landing straight on the sale screen would then
 * either fail to find the piece or, worse, resolve it against the wrong
 * shop. This resolves the context first and only then hands over.
 *
 * How the user's identity travels: in the session cookie the browser already
 * sends, nothing more. The tag carries only the stock id — an opaque cuid
 * that names a row and grants nothing. Putting a user or a token on a
 * printed label would make it a credential shared by everyone who ever
 * photographs the tag, and printed tags cannot be rotated or revoked.
 *
 * The store is not carried either: a stock id is globally unique, so the row
 * itself says which shop it belongs to. That is safer than trusting a store
 * in the URL, because it cannot be edited to point somewhere else.
 *
 * Not signed in? Middleware sends the scan to /login with this path as the
 * callback, so signing in returns here and the flow continues.
 */

const DENIED = "denied";
const MISSING = "missing";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ stockId: string }> },
) {
  const { stockId } = await params;

  const saleUrl = (reason?: string) =>
    new URL(
      `/q/${encodeURIComponent(stockId)}${reason ? `?x=${reason}` : ""}`,
      request.url,
    );

  try {
    const user = await getCurrentUser();

    // Middleware normally catches this first; repeated here because this
    // route decides who may act on a store and must not depend on another
    // layer having run.
    if (!user?.id) {
      return NextResponse.redirect(
        new URL(
          `/login?callbackUrl=${encodeURIComponent(`/s/${stockId}`)}`,
          request.url,
        ),
      );
    }

    // Looked up across stores on purpose — this is the one query that has to
    // be unscoped, because working out which store to scope to is its whole
    // job. Nothing about the row is returned to the caller.
    const stock = await prisma.inventoryStock.findUnique({
      where: { id: stockId },
      select: { storeId: true, store: { select: { isActive: true } } },
    });

    if (!stock || !stock.store.isActive) {
      return NextResponse.redirect(saleUrl(MISSING));
    }

    // Membership is what authorises the switch. Without this check the URL
    // would be a way into any store's stock, which is exactly the hole a
    // scan-to-sell flow could otherwise open.
    const memberships = user.id ? await listMemberships(user.id) : [];

    const allowed =
      user.role === UserRole.SUPER_ADMIN ||
      memberships.some((membership) => membership.storeId === stock.storeId);

    if (!allowed) {
      return NextResponse.redirect(saleUrl(DENIED));
    }

    // Signed here, at the end of the authorisation decision, and carried in
    // the URL rather than a cookie: the sale then writes to this shop without
    // re-pointing the scanner's session at it, and works in a browser that
    // declines cookies. The token is bound to this user, this piece and this
    // store, and expires — see lib/quick-sale-token.
    const token = createQuickSaleToken({
      stockId,
      storeId: stock.storeId,
      userId: user.id,
    });

    const destination = saleUrl();
    destination.searchParams.set("t", token);

    return NextResponse.redirect(destination);
  } catch (error) {
    console.error("quick-sale entry error:", error);
    return NextResponse.redirect(saleUrl(MISSING));
  }
}
