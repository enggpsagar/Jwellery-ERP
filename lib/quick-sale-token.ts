import { createHmac, timingSafeEqual } from "crypto";

/**
 * Short-lived proof that a scan was resolved for a particular person, piece
 * and shop.
 *
 * Minted by the scan entry point (`app/s/[stockId]`) only after it has
 * checked that the signed-in user really is a member of the store the piece
 * belongs to, and consumed by the sale screen and the sale action.
 *
 * This is what carries store context through the flow. The alternative —
 * writing the active store to a cookie — has two problems this avoids: it
 * quietly re-points the user's whole session at another shop as a side effect
 * of scanning a tag, and it makes the flow fail in any browser that declines
 * the cookie.
 *
 * It is emphatically NOT the thing printed on the tag. A printed QR lasts as
 * long as the piece, so anything expiring stamped onto it would brick the
 * label; and a printed secret is one shared by everyone who photographs it.
 * The tag carries an opaque id, and this token is minted fresh per scan.
 *
 * What it is bound to, and why each matters:
 *   stockId — cannot be replayed against a different piece
 *   storeId — names the shop the sale is written to
 *   userId  — useless to anyone but the person it was issued to, who would
 *             also need that person's session to get anywhere
 *   expiry  — bounds how long a leaked URL is worth anything
 *
 * It is a scoped capability, not a credential: on its own it opens nothing,
 * because every consumer still requires a valid session and re-checks
 * permissions server-side.
 */

/**
 * Long enough to price a piece, talk to the customer and confirm; short
 * enough that a URL left in someone's history is worthless by the time it is
 * found. Expiry is not the security boundary — the session and the
 * permission checks are — so this is a containment window, not a lock.
 */
export const QUICK_SALE_TOKEN_TTL_MS = 15 * 60 * 1000;

const VERSION = "v1";

export type QuickSaleTokenPayload = {
  stockId: string;
  storeId: string;
  userId: string;
};

function secret(): string {
  const value = process.env.NEXTAUTH_SECRET;

  // Fail closed. Without a secret an HMAC would be forgeable, so it is
  // better for the scan flow to stop than to issue tokens anyone can mint.
  if (!value) {
    throw new Error("NEXTAUTH_SECRET is required to sign quick-sale tokens.");
  }

  return value;
}

function base64url(value: Buffer | string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(body: string): string {
  return base64url(createHmac("sha256", secret()).update(body).digest());
}

/**
 * Mint a token for a scan that has already been authorised.
 *
 * Callers must have verified membership before calling this — signing is the
 * last step of an authorisation decision, never a substitute for one.
 */
export function createQuickSaleToken(
  payload: QuickSaleTokenPayload,
  now: number = Date.now(),
): string {
  const expiresAt = now + QUICK_SALE_TOKEN_TTL_MS;

  // Dots separate the fields, so none of them may contain one. Ids are cuids
  // and the timestamp is digits, but the values are encoded rather than
  // trusted to stay that way.
  const body = [
    VERSION,
    base64url(payload.stockId),
    base64url(payload.storeId),
    base64url(payload.userId),
    String(expiresAt),
  ].join(".");

  return `${body}.${sign(body)}`;
}

export type QuickSaleTokenResult =
  | { valid: true; payload: QuickSaleTokenPayload }
  | { valid: false; reason: "malformed" | "signature" | "expired" };

function decode(value: string): string {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
}

/**
 * Verify a token and return what it asserts.
 *
 * Returns a result rather than throwing so callers can tell an expired token
 * (offer to scan again) from a tampered one (refuse).
 */
export function verifyQuickSaleToken(
  token: string | null | undefined,
  now: number = Date.now(),
): QuickSaleTokenResult {
  if (!token) return { valid: false, reason: "malformed" };

  const parts = token.split(".");
  if (parts.length !== 6) return { valid: false, reason: "malformed" };

  const [version, stockId, storeId, userId, expiresAt, signature] = parts;
  if (version !== VERSION) return { valid: false, reason: "malformed" };

  const body = [version, stockId, storeId, userId, expiresAt].join(".");

  let expected: string;
  try {
    expected = sign(body);
  } catch {
    return { valid: false, reason: "signature" };
  }

  const givenBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  // Length is checked first because timingSafeEqual throws on a mismatch;
  // the length of an HMAC is not a secret, so leaking it costs nothing.
  if (
    givenBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(givenBuffer, expectedBuffer)
  ) {
    return { valid: false, reason: "signature" };
  }

  // Only after the signature is proven — an unverified expiry is just a
  // number an attacker chose.
  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now) {
    return { valid: false, reason: "expired" };
  }

  try {
    return {
      valid: true,
      payload: {
        stockId: decode(stockId),
        storeId: decode(storeId),
        userId: decode(userId),
      },
    };
  } catch {
    return { valid: false, reason: "malformed" };
  }
}
