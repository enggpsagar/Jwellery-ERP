"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireStoreScope, getEffectiveAccess } from "@/lib/store-context";
import { logger } from "@/lib/logger";
import type { SellingRateKind } from "@/lib/selling-rates";

export type SellingRateUpdate = {
  kind: SellingRateKind;
  id: string;
  /** null clears the rate (billing then falls back as it does today). */
  price: number | null;
};

export type SellingRateResult = { success: boolean; message: string };

// Decimal(12, 2): anything at or above 10^10 overflows the column.
const MAX_PRICE = 9_999_999_999.99;

/**
 * Header "Today's Rates" save. Writes the same sellingPrice columns
 * Settings > Taxonomy edits (see lib/selling-rates.ts for the mapping), so
 * the next invoice/estimate/quotation picks the new rate up directly.
 * Store Owner only — judged by the role in the active store, not the User
 * row, since one person can be Admin in one store and Staff in another.
 */
export async function updateSellingRates(
  updates: SellingRateUpdate[],
): Promise<SellingRateResult> {
  const access = await getEffectiveAccess();
  if (!access || (access.role !== UserRole.ADMIN && access.role !== UserRole.SUPER_ADMIN)) {
    return { success: false, message: "Only the Store Owner can change selling rates." };
  }

  if (!Array.isArray(updates) || updates.length === 0) {
    return { success: false, message: "Nothing to save." };
  }
  if (updates.length > 200) {
    return { success: false, message: "Too many rates in one save." };
  }

  for (const u of updates) {
    if (!u || typeof u.id !== "string" || !["metal", "purity", "stoneType"].includes(u.kind)) {
      return { success: false, message: "Invalid rate." };
    }
    if (
      u.price !== null &&
      (typeof u.price !== "number" || !Number.isFinite(u.price) || u.price < 0 || u.price > MAX_PRICE)
    ) {
      return { success: false, message: "Rates must be a positive amount." };
    }
  }

  const storeId = await requireStoreScope();

  try {
    // updateMany scoped by storeId: an id from another store matches
    // nothing, and throwing inside the transaction rolls the whole save back.
    await prisma.$transaction(async (tx) => {
      for (const u of updates) {
        const data = { sellingPrice: u.price === null ? null : Math.round(u.price * 100) / 100 };
        const where = { id: u.id, storeId };
        const { count } =
          u.kind === "purity"
            ? await tx.storeMetalPurity.updateMany({ where, data })
            : u.kind === "stoneType"
              ? await tx.storeMetalOrigin.updateMany({ where, data })
              : await tx.storeMetal.updateMany({ where, data });
        if (count === 0) throw new RateNotFoundError();
      }
    });
  } catch (error) {
    if (error instanceof RateNotFoundError) {
      return { success: false, message: "Some rates no longer exist. Reload and try again." };
    }
    logger.error("updateSellingRates failed", error);
    return { success: false, message: "Could not save rates." };
  }

  // The header lives in the dashboard layout, so refresh that; Settings
  // shows the same columns.
  revalidatePath("/", "layout");

  return { success: true, message: "Selling rates updated." };
}

class RateNotFoundError extends Error {}
