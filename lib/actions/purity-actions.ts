"use server";

import { revalidatePath } from "next/cache";
import { PurityType, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireStoreScope } from "@/lib/store-context";
import { requireRole } from "@/lib/auth/auth";
import {
  DEFAULT_FINENESS,
  getFinenessMap,
  DEFAULT_GRAMS_PER_CARAT,
  getGramsPerCaratMap,
} from "@/lib/purity";
import { logger } from "@/lib/logger";

export type PurityFinenessRow = {
  purity: PurityType;
  finenessPercent: number;
};

export type CaratConversionRateRow = {
  purity: PurityType;
  gramsPerCarat: number;
};

export type MetalSellingRateRow = {
  purity: PurityType;
  sellingPrice: number | null;
};

// Karat/fineness purities only — Diamond and other gemstones are priced
// per stone type via StoreMetal.sellingPrice, not per purity (see the
// MetalSellingRate model comment in schema.prisma).
const METAL_PURITIES: PurityType[] = [
  PurityType.GOLD_24K,
  PurityType.GOLD_22K,
  PurityType.GOLD_20K,
  PurityType.GOLD_18K,
  PurityType.SILVER_999,
  PurityType.SILVER_925,
  PurityType.PLATINUM_950,
  PurityType.PLATINUM_900,
];

export type PurityFormState = {
  success: boolean;
  message: string;
};

/** Full fineness table for the current store, seeded with defaults if empty. */
export async function getPurityFineness(): Promise<PurityFinenessRow[]> {
  const storeId = await requireStoreScope();
  const map = await getFinenessMap(storeId);

  return (Object.keys(DEFAULT_FINENESS) as PurityType[]).map((purity) => ({
    purity,
    finenessPercent: map[purity],
  }));
}

/** Full grams-per-carat table for the current store, seeded with the 0.2
 * default if empty — the Settings UI counterpart to getGramsPerCaratRateMap. */
export async function getCaratConversionRates(): Promise<CaratConversionRateRow[]> {
  const storeId = await requireStoreScope();
  const map = await getGramsPerCaratMap(storeId);

  return (Object.keys(DEFAULT_GRAMS_PER_CARAT) as PurityType[]).map((purity) => ({
    purity,
    gramsPerCarat: map[purity],
  }));
}

/** Same data as getCaratConversionRates, shaped as the lookup map every
 * Carat Weight <-> Net Weight form (Product/Stock/Invoice/Purchase/
 * Kacha/Quotation) needs as a prop for resolveGramsPerCarat(). */
export async function getCaratConversionRateMap(): Promise<Record<PurityType, number>> {
  const storeId = await requireStoreScope();
  return getGramsPerCaratMap(storeId);
}

/** Full selling-price table for the current store's karat/fineness
 * purities — powers the Settings > Purity "Metal Selling Rates" grid.
 * Unlike getCaratConversionRates/getPurityFineness, unconfigured purities
 * come back as null rather than a seeded default: there's no meaningful
 * universal selling price, so an unconfigured row must stay absent. */
export async function getMetalSellingRates(): Promise<MetalSellingRateRow[]> {
  const storeId = await requireStoreScope();
  const rows = await prisma.metalSellingRate.findMany({ where: { storeId } });

  const byPurity = new Map(rows.map((row) => [row.purity, Number(row.sellingPrice)]));

  return METAL_PURITIES.map((purity) => ({
    purity,
    sellingPrice: byPurity.get(purity) ?? null,
  }));
}

/** Lookup-map counterpart of getMetalSellingRates, for the rate-prefill
 * fallback chain in Invoice/Kacha/Quotation forms — only the configured
 * purities are present, so a `??` chain falls through cleanly. */
export async function getMetalSellingRateMap(): Promise<Partial<Record<PurityType, number>>> {
  const storeId = await requireStoreScope();
  const rows = await prisma.metalSellingRate.findMany({ where: { storeId } });

  const map: Partial<Record<PurityType, number>> = {};
  for (const row of rows) {
    map[row.purity] = Number(row.sellingPrice);
  }
  return map;
}

export async function updateMetalSellingRates(
  prevState: PurityFormState,
  formData: FormData,
): Promise<PurityFormState> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return {
      success: false,
      message: "Only the Store Owner can update these settings.",
    };
  }

  try {
    const storeId = await requireStoreScope();

    const updates = METAL_PURITIES.map((purity) => {
      const raw = formData.get(`sellingPrice_${purity}`);
      const value = Number(raw);

      // Blank/invalid/zero-or-less clears the rate entirely (rather than
      // writing a bogus default, since unlike fineness/carat-conversion
      // there's no meaningful universal selling price to fall back to) so
      // the item-level fallback to StoreMetal.sellingPrice can take over.
      if (raw === null || raw === "" || Number.isNaN(value) || value <= 0) {
        return prisma.metalSellingRate.deleteMany({ where: { storeId, purity } });
      }

      return prisma.metalSellingRate.upsert({
        where: { storeId_purity: { storeId, purity } },
        update: { sellingPrice: value },
        create: { storeId, purity, sellingPrice: value },
      });
    });

    await prisma.$transaction(updates);

    revalidatePath("/settings/purity");

    return { success: true, message: "Metal selling rates updated successfully" };
  } catch (error) {
    logger.error("updateMetalSellingRates error", error);
    return { success: false, message: "Failed to update metal selling rates" };
  }
}

export async function updatePurityFineness(
  prevState: PurityFormState,
  formData: FormData,
): Promise<PurityFormState> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return {
      success: false,
      message: "Only the Store Owner can update these settings.",
    };
  }

  try {
    const storeId = await requireStoreScope();

    const updates = (Object.keys(DEFAULT_FINENESS) as PurityType[]).map(
      (purity) => {
        const raw = formData.get(`fineness_${purity}`);
        const value = Number(raw);
        const finenessPercent =
          raw === null || raw === "" || Number.isNaN(value)
            ? DEFAULT_FINENESS[purity]
            : Math.min(100, Math.max(0, value));

        return prisma.purityFineness.upsert({
          where: { storeId_purity: { storeId, purity } },
          update: { finenessPercent },
          create: { storeId, purity, finenessPercent },
        });
      },
    );

    await prisma.$transaction(updates);

    revalidatePath("/settings/purity");

    return { success: true, message: "Purity settings updated successfully" };
  } catch (error) {
    logger.error("updatePurityFineness error", error);
    return { success: false, message: "Failed to update purity settings" };
  }
}

export async function updateCaratConversionRates(
  prevState: PurityFormState,
  formData: FormData,
): Promise<PurityFormState> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return {
      success: false,
      message: "Only the Store Owner can update these settings.",
    };
  }

  try {
    const storeId = await requireStoreScope();

    const updates = (Object.keys(DEFAULT_GRAMS_PER_CARAT) as PurityType[]).map(
      (purity) => {
        const raw = formData.get(`gramsPerCarat_${purity}`);
        const value = Number(raw);
        // A conversion rate of zero or less would divide by zero (or worse)
        // everywhere Carat Weight <-> Net Weight gets derived — same
        // reasoning as clamping fineness to [0, 100], just a different
        // invalid range here.
        const gramsPerCarat =
          raw === null || raw === "" || Number.isNaN(value) || value <= 0
            ? DEFAULT_GRAMS_PER_CARAT[purity]
            : value;

        return prisma.caratConversionRate.upsert({
          where: { storeId_purity: { storeId, purity } },
          update: { gramsPerCarat },
          create: { storeId, purity, gramsPerCarat },
        });
      },
    );

    await prisma.$transaction(updates);

    revalidatePath("/settings/purity");

    return { success: true, message: "Carat conversion rules updated successfully" };
  } catch (error) {
    logger.error("updateCaratConversionRates error", error);
    return { success: false, message: "Failed to update carat conversion rules" };
  }
}
