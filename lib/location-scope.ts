import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/auth";

export type LocationScope = {
  restricted: boolean;
  locationIds: string[];
};

const UNRESTRICTED: LocationScope = { restricted: false, locationIds: [] };

/**
 * Resolves the current user's location scope.
 *
 * - ADMIN / SUPER_ADMIN are always unrestricted (see everything), same
 *   as they're never gated by module permissions either.
 * - STAFF is restricted only when they have 1+ UserLocationAccess grants —
 *   zero grants means unrestricted, mirroring how an empty `permissions`
 *   array means "not customized" -> full access in lib/roles.ts. Both
 *   axes use the same "empty = unrestricted" rule on purpose.
 * - KARIGAR is scoped to their own Karigar.locationId (a single value, not
 *   a grant table — a karigar works out of one place) as an *additional*
 *   filter layered on top of the existing row-level karigarId restriction
 *   already enforced elsewhere (see CLAUDE.md's Roles & permissions
 *   section). No locationId on the Karigar row means unrestricted.
 */
export async function getLocationScope(): Promise<LocationScope> {
  const user = await getCurrentUser();
  if (!user) return UNRESTRICTED;

  if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) {
    return UNRESTRICTED;
  }

  if (user.role === UserRole.KARIGAR) {
    if (!user.karigarId) return UNRESTRICTED;

    const karigar = await prisma.karigar.findUnique({
      where: { id: user.karigarId },
      select: { locationId: true },
    });

    return karigar?.locationId
      ? { restricted: true, locationIds: [karigar.locationId] }
      : UNRESTRICTED;
  }

  // STAFF, and legacy MANAGER rows kept only so old data doesn't break.
  const locationIds = user.locationIds ?? [];
  return locationIds.length ? { restricted: true, locationIds } : UNRESTRICTED;
}

/**
 * A Prisma `where` fragment for any model with a `locationId` column —
 * spread it into a query's `where` alongside the mandatory `storeId` scope:
 *
 *   const scope = await getLocationScope();
 *   prisma.inventoryStock.findMany({ where: { storeId, ...locationWhere(scope) } });
 *
 * Returns `{}` when unrestricted, so it's always safe to spread.
 */
export function locationWhere(scope: LocationScope): { locationId?: { in: string[] } } {
  if (!scope.restricted) return {};
  return { locationId: { in: scope.locationIds } };
}

/**
 * Verifies a specific locationId (typically from client input, e.g. a form
 * submission) is one the current user is allowed to write data against.
 * Use this before create/update actions that accept a locationId, the same
 * way a productId/metalTypeId gets store-scoped-validated before use — a
 * restricted Staff user should not be able to file a stock entry, invoice,
 * etc. against a location outside their grants just by posting its id.
 */
export function isLocationAllowed(scope: LocationScope, locationId: string | null | undefined) {
  if (!locationId) return true;
  if (!scope.restricted) return true;
  return scope.locationIds.includes(locationId);
}
