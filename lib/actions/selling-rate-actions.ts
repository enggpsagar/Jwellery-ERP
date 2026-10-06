"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireStoreScope, getEffectiveAccess } from "@/lib/store-context";
import { logger } from "@/lib/logger";
import { getCurrentUser } from "@/lib/auth/auth";
import {
  describeSellingRate,
  recordSellingRateChange,
  type SellingRateKind,
} from "@/lib/selling-rates";
import { STARTER_METALS } from "@/lib/inventory/starter-masters";
import { defaultFinenessForLabel } from "@/lib/purity-fineness-check";

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
  const changedById = (await getCurrentUser())?.id ?? null;

  try {
    // Every id is looked up with { id, storeId }: one from another store
    // isn't found, and throwing inside the transaction rolls the save back.
    // Each real change also appends a SellingRateEntry (rate history).
    await prisma.$transaction(async (tx) => {
      for (const u of updates) {
        const current = await describeSellingRate(tx, storeId, u.kind, u.id);
        if (!current) throw new RateNotFoundError();

        const after = u.price === null ? null : Math.round(u.price * 100) / 100;
        if (after === current.price) continue;

        const data = { sellingPrice: after };
        const where = { id: u.id, storeId };
        if (u.kind === "purity") await tx.storeMetalPurity.updateMany({ where, data });
        else if (u.kind === "stoneType") await tx.storeMetalOrigin.updateMany({ where, data });
        else await tx.storeMetal.updateMany({ where, data });

        await recordSellingRateChange(tx, {
          storeId,
          kind: u.kind,
          refId: u.id,
          before: current.price,
          after,
          changedById,
        });
      }
    });
  } catch (error) {
    if (error instanceof RateNotFoundError) {
      return { success: false, message: "Some rates no longer exist. Reload and try again." };
    }
    logger.error("updateSellingRates failed", error);
    return { success: false, message: "Could not save rates." };
  }

  // The header lives in the dashboard layout, so refresh that; Settings and
  // Metal Rates show the same data.
  revalidatePath("/", "layout");

  return { success: true, message: "Selling rates updated." };
}

class RateNotFoundError extends Error {}

async function requireStoreOwner(): Promise<string | null> {
  const access = await getEffectiveAccess();
  if (!access || (access.role !== UserRole.ADMIN && access.role !== UserRole.SUPER_ADMIN)) return null;
  return requireStoreScope();
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * "Add standard rates": for every metal / stone the store ALREADY has whose
 * name matches a starter metal (lib/inventory/starter-masters.ts), adds the
 * standard purities (Gold 24K/22K/20K/18K/14K, Silver 999/925, Platinum
 * 950/900) or stone types (Natural, Lab-Grown) it is missing. Never creates
 * a metal, never touches an existing row — stores created before
 * 2026-10-05 weren't seeded with these, and back-filling them silently was
 * ruled out, so it is the owner's click. A metal with Has Purity off is
 * skipped (turning it on changes how its products are entered).
 */
export async function addStandardSellingRates(): Promise<SellingRateResult> {
  const storeId = await requireStoreOwner();
  if (!storeId) return { success: false, message: "Only the Store Owner can add rates." };

  try {
    const added = await prisma.$transaction(async (tx) => {
      const metals = await tx.storeMetal.findMany({
        where: { storeId },
        select: {
          id: true,
          name: true,
          hasPurity: true,
          isGemstone: true,
          purities: { select: { label: true, sortOrder: true } },
          origins: { select: { name: true } },
        },
      });

      let count = 0;
      const purityOff: string[] = [];
      for (const metal of metals) {
        const starter = STARTER_METALS.find((s) => sameName(s.name, metal.name));
        if (!starter) continue;
        if (!metal.isGemstone && !metal.hasPurity && starter.purities?.length) purityOff.push(metal.name);

        if (!metal.isGemstone && metal.hasPurity && starter.purities) {
          const missing = starter.purities.filter((p) => !metal.purities.some((x) => sameName(x.label, p.label)));
          const baseOrder = metal.purities.reduce((m, x) => Math.max(m, x.sortOrder), -1) + 1;
          if (missing.length) {
            await tx.storeMetalPurity.createMany({
              data: missing.map((p, i) => ({
                storeId,
                storeMetalId: metal.id,
                label: p.label,
                skuCode: p.skuCode,
                finenessPercent: p.finenessPercent,
                isHallmarkable: p.isHallmarkable,
                sortOrder: baseOrder + i,
              })),
            });
            count += missing.length;
          }
        }

        if (metal.isGemstone && starter.stoneTypes) {
          const missing = starter.stoneTypes.filter((t) => !metal.origins.some((x) => sameName(x.name, t)));
          if (missing.length) {
            await tx.storeMetalOrigin.createMany({
              data: missing.map((name) => ({ storeId, storeMetalId: metal.id, name })),
            });
            count += missing.length;
          }
        }
      }
      return { count, purityOff };
    });

    revalidatePath("/", "layout");
    const skipped = added.purityOff.length
      ? ` ${added.purityOff.join(", ")}: turn on Has Purity in Settings to add its purities.`
      : "";
    return added.count === 0
      ? { success: true, message: `Every standard purity and stone type is already there.${skipped}` }
      : { success: true, message: `Added ${added.count} purities / stone types — enter their rates and save.${skipped}` };
  } catch (error) {
    logger.error("addStandardSellingRates failed", error);
    return { success: false, message: "Could not add the standard rates." };
  }
}

/**
 * "+ Add" under one metal in the rates popover: a new purity (metal with Has
 * Purity on, e.g. "23K") or stone type (gemstone, e.g. "Moissanite"), with
 * an optional first rate. Same rules as Settings' own add: unique label per
 * metal, SKU code from the label, fineness from the label's standard.
 */
export async function addSellingRateOption(input: {
  metalId: string;
  label: string;
  price: number | null;
}): Promise<SellingRateResult> {
  const storeId = await requireStoreOwner();
  if (!storeId) return { success: false, message: "Only the Store Owner can add rates." };

  const label = String(input?.label ?? "").trim();
  const price = input?.price ?? null;
  if (!label) return { success: false, message: "Enter a name, e.g. 23K or Moissanite." };
  if (label.length > 40) return { success: false, message: "Keep the name to 40 characters or fewer." };
  if (price !== null && (typeof price !== "number" || !Number.isFinite(price) || price < 0 || price > MAX_PRICE)) {
    return { success: false, message: "Rates must be a positive amount." };
  }
  const after = price === null ? null : Math.round(price * 100) / 100;
  const changedById = (await getCurrentUser())?.id ?? null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const metal = await tx.storeMetal.findFirst({
        where: { id: String(input.metalId), storeId },
        select: { id: true, name: true, hasPurity: true, isGemstone: true },
      });
      if (!metal) return "Metal not found." as const;

      if (metal.isGemstone) {
        const clash = await tx.storeMetalOrigin.findFirst({
          where: { storeMetalId: metal.id, name: { equals: label, mode: "insensitive" } },
          select: { id: true },
        });
        if (clash) return `${metal.name} ${label} already exists.`;
        const created = await tx.storeMetalOrigin.create({
          data: { storeId, storeMetalId: metal.id, name: label, sellingPrice: after },
          select: { id: true },
        });
        await recordSellingRateChange(tx, { storeId, kind: "stoneType", refId: created.id, before: null, after, changedById });
        return null;
      }

      if (!metal.hasPurity) {
        return `${metal.name} has no purities — turn on Has Purity in Settings to price it by purity.`;
      }
      const clash = await tx.storeMetalPurity.findFirst({
        where: { storeMetalId: metal.id, label: { equals: label, mode: "insensitive" } },
        select: { id: true },
      });
      if (clash) return `${metal.name} ${label} already exists.`;
      const last = await tx.storeMetalPurity.aggregate({ where: { storeMetalId: metal.id }, _max: { sortOrder: true } });
      const skuCode = (label.replace(/[^0-9A-Za-z]/g, "").toUpperCase() || "P").slice(0, 20);
      const created = await tx.storeMetalPurity.create({
        data: {
          storeId,
          storeMetalId: metal.id,
          label,
          skuCode,
          finenessPercent: defaultFinenessForLabel(metal.name, label),
          sellingPrice: after,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
        select: { id: true },
      });
      await recordSellingRateChange(tx, { storeId, kind: "purity", refId: created.id, before: null, after, changedById });
      return null;
    });

    if (result) return { success: false, message: result };
    revalidatePath("/", "layout");
    return { success: true, message: `${label} added.` };
  } catch (error) {
    logger.error("addSellingRateOption failed", error);
    return { success: false, message: "Could not add it." };
  }
}
