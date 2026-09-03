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

export type LocationResolution =
  | { ok: true; locationId: string | null }
  | { ok: false; message: string };

/**
 * Resolves the locationId to actually persist for a create/update action,
 * given what the form submitted and the current user's location scope.
 *
 * Every create/update action across invoices, purchases, quotations, and
 * kacha invoices used to validate a submitted locationId only when one was
 * actually submitted (`if (locationId) { ... }`) — leaving nothing to stop
 * a location-restricted Staff user from submitting none at all (the
 * location picker always offers a "None" option, unconditionally). That
 * saved the record with `locationId: null`, which then never matches that
 * same user's own list query (`locationWhere` filters `{ locationId: { in:
 * scope.locationIds } }`, and Prisma's `in` never matches `null`) — they
 * could create an invoice/purchase/quotation and then never see it again,
 * including the one they just made. This is the single place that gap is
 * now closed; every one of those actions should call this instead of
 * re-deriving the same validation ad hoc.
 */
export async function resolveWritableLocationId(
  storeId: string,
  submittedLocationId: string | null,
  scope: LocationScope,
): Promise<LocationResolution> {
  if (submittedLocationId) {
    const location = await prisma.storeLocation.findFirst({
      where: { id: submittedLocationId, storeId },
      select: { id: true },
    });
    if (!location) {
      return { ok: false, message: "Selected location is invalid" };
    }
    if (!isLocationAllowed(scope, submittedLocationId)) {
      return { ok: false, message: "You don't have access to bill against this location" };
    }
    return { ok: true, locationId: submittedLocationId };
  }

  if (!scope.restricted) {
    return { ok: true, locationId: null };
  }

  // Restricted with exactly one grant: use it automatically rather than
  // making a single-branch Staff user pick what they only ever have one
  // option for.
  if (scope.locationIds.length === 1) {
    return { ok: true, locationId: scope.locationIds[0] };
  }

  // Restricted with more than one grant and nothing chosen: this is exactly
  // the case that used to silently save as locationId: null. Require an
  // explicit choice instead.
  return {
    ok: false,
    message: "Please select which of your locations this is for.",
  };
}
