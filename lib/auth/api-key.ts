import crypto from "crypto";

import { prisma } from "@/lib/prisma";

const KEY_PREFIX = "sk_live_";

/**
 * A freshly-minted API key, returned only once at creation time. `raw` is
 * what the caller sees and copies; only `hash` and `prefix` are ever
 * persisted (see hashApiKey) — the raw value cannot be recovered afterward.
 */
export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const raw = KEY_PREFIX + crypto.randomBytes(32).toString("base64url");
  return { raw, prefix: raw.slice(0, 12), hash: hashApiKey(raw) };
}

export function hashApiKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export class ApiKeyAuthError extends Error {
  status: 401 | 403;

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiKeyAuthError";
  }
}

export type ApiKeyAuthResult = {
  apiKeyId: string;
  storeId: string;
  /** No User row backs an API key — every core function's actor context
   * must treat this the same way it already treats a nullable actorId. */
  actorId: null;
  actorName: string;
  permissions: string[];
};

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Authenticates an `Authorization: Bearer <key>` request the same way
 * `requirePermissionInStore` authenticates a session — resolves a storeId
 * and an actor, and throws if the caller isn't allowed to do what it's
 * asking. There is no cookie on an API-key request, so storeId comes from
 * the key row itself rather than `requireStoreScope()`.
 *
 * Revocation is checked on every call against the database, never cached —
 * a revoked key must stop working immediately on every serverless instance,
 * not just the one that revoked it.
 */
export async function requireApiKey(
  request: Request,
  permission: string,
): Promise<ApiKeyAuthResult> {
  const raw = extractBearerToken(request);
  if (!raw) {
    throw new ApiKeyAuthError(401, "Missing API key");
  }

  const keyHash = hashApiKey(raw);
  const apiKey = await prisma.apiKey.findUnique({ where: { keyHash } });

  // Same message whether the key doesn't exist, was revoked, or expired —
  // never tell a caller which of those is true.
  const isExpired = apiKey?.expiresAt ? apiKey.expiresAt < new Date() : false;
  if (!apiKey || apiKey.isRevoked || isExpired) {
    throw new ApiKeyAuthError(401, "Invalid or revoked API key");
  }

  if (!apiKey.permissions.includes(permission)) {
    throw new ApiKeyAuthError(
      403,
      `This API key does not have the '${permission}' permission`,
    );
  }

  // Best-effort — a slow/failed write here must never block the request
  // that's actually being authorized.
  prisma.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
    .catch((error) => {
      console.error("Failed to update ApiKey.lastUsedAt:", error);
    });

  return {
    apiKeyId: apiKey.id,
    storeId: apiKey.storeId,
    actorId: null,
    actorName: `API: ${apiKey.name}`,
    permissions: apiKey.permissions,
  };
}
