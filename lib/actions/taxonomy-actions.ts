"use server";

import { revalidatePath, updateTag } from "next/cache";
import { UserRole, WeightUnit, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireStoreScope, getStoreIdForRead, assertPlanActiveForExport } from "@/lib/store-context";
import { actionErrorMessage } from "@/lib/action-error";
import { requireRole } from "@/lib/auth/auth";
import { logger } from "@/lib/logger";
import { sellingRatesTag } from "@/lib/cache-tags";
import { earlierRowHint, namesAsCandidates, suggestFrom } from "@/lib/import-suggest";
import { parseExcelWorkbook } from "@/lib/excel-export";
import { buildMultiSheetTemplate } from "@/lib/excel-multi-sheet-template";
import {
  CATEGORIES_SHEET,
  METALS_SHEET,
  METAL_FILE_NOTES,
  METAL_FILE_SHEETS,
  PURITIES_SHEET,
  STONES_SHEET,
  STONE_FILE_NOTES,
  STONE_FILE_SHEETS,
  STONE_TYPES_SHEET,
  UNIT_LABELS,
  parseUnitLabel,
  parseYesNo,
  sheetHeaders,
  taxonomySheetInstructions,
  yesNo,
} from "@/lib/inventory/taxonomy-sheet";
import { getCurrentUser } from "@/lib/auth/auth";
import { recordSellingRateChange, type SellingRateKind } from "@/lib/selling-rates";
import { defaultFinenessForLabel, expectedFinenessForLabel, finenessMismatch } from "@/lib/purity-fineness-check";

export type StoreMetalRow = {
  id: string;
  name: string;
  hasPurity: boolean;
  isActive: boolean;
  // isGemstone: false -> a Metals-section row. true -> a Stones-section row
  // (see TaxonomySettingsForm, which splits this same list by the flag).
  // Stone Type options (free text — Natural, Lab-Grown, Moissanite, or
  // whatever else the store adds) live on the separate StoreMetalOrigin
  // child table — see getStoreMetalOrigins below, mirroring how a
  // StoreCategory's Types live on StoreCategoryType.
  isGemstone: boolean;
  // The unit every weight field for this metal/stone is persisted in —
  // see the WeightUnit enum's doc comment in schema.prisma and
  // lib/purity.ts's toPrimaryUnit().
  primaryUnit: WeightUnit;
  // Configured default selling price per primaryUnit (per gram, or per
  // carat for a gemstone) — Settings > Taxonomy. Null when not configured:
  // Invoice creation then falls back to the linked stock item's own
  // saleRate, and failing that, manual entry.
  sellingPrice: number | null;
};

export type StoreMetalOriginRow = {
  id: string;
  storeMetalId: string;
  name: string;
  isActive: boolean;
  // 1 ct = 0.2g by default, overridable per Stone Type — see the field's
  // own doc comment in schema.prisma.
  gramsPerCarat: number;
  sellingPrice: number | null;
};

// A single Purity option under a real (hasPurity) Metal — e.g. "22K" under
// Gold. Replaces the old global PurityType enum + its three enum-keyed
// Settings tables (PurityFineness/CaratConversionRate/MetalSellingRate).
export type StoreMetalPurityRow = {
  id: string;
  storeMetalId: string;
  label: string;
  skuCode: string;
  finenessPercent: number;
  sellingPrice: number | null;
  isHallmarkable: boolean;
  sortOrder: number;
  isActive: boolean;
};

export type StoreCategoryRow = {
  id: string;
  name: string;
  isActive: boolean;
  // Which Metals this category is restricted to — empty means universal
  // (shown regardless of the selected Metal), matching every category's
  // behavior before this existed. See StoreCategoryMetal in schema.prisma.
  metalTagIds: string[];
};

export type StoreStyleRow = {
  id: string;
  name: string;
  isActive: boolean;
};

export type StoreStoneClarityRow = StoreStyleRow;

export type StoreCategoryTypeRow = {
  id: string;
  categoryId: string;
  name: string;
  isActive: boolean;
};

export type TaxonomyFormState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
  /** The created/updated row's id — lets a caller that just created a new
   * Stone/Stone Type (e.g. an inline "Add Stone" dialog on a billing form)
   * select it immediately without a second round-trip to find it by name. */
  id?: string;
};

const TAXONOMY_PATH = "/settings/taxonomy";

// ---------------------------------------------------------------------------
// Store Metals
// ---------------------------------------------------------------------------

export async function getStoreMetals(): Promise<StoreMetalRow[]> {
  const storeId = await getStoreIdForRead();

  const metals = await prisma.storeMetal.findMany({
    where: { storeId },
    orderBy: { name: "asc" },
  });

  return metals.map((metal) => ({
    id: metal.id,
    name: metal.name,
    hasPurity: metal.hasPurity,
    isActive: metal.isActive,
    isGemstone: metal.isGemstone,
    primaryUnit: metal.primaryUnit,
    sellingPrice: metal.sellingPrice ? Number(metal.sellingPrice) : null,
  }));
}

export async function upsertStoreMetal(
  prevState: TaxonomyFormState,
  formData: FormData,
): Promise<TaxonomyFormState> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return {
      success: false,
      message: "Only the Store Owner can update these settings.",
    };
  }

  try {
    const id = String(formData.get("id") || "").trim();
    const name = String(formData.get("name") || "").trim();
    const hasPurity = formData.get("hasPurity") === "on";
    // Not a user-facing checkbox on either form — MetalFormRow simply never
    // sends this field (so it defaults false here), while StoneFormRow sends
    // a fixed hidden "on" — the two forms post to this same action, and this
    // is how it tells which section's row it's saving.
    const isGemstone = formData.get("isGemstone") === "on";
    // Explicit "GRAM"/"CARAT" from the full Settings form is respected as-is;
    // a caller that never sends this field at all (e.g. the quick "Add
    // Metal"/"Add Stone" dialog opened mid-form elsewhere) falls back to the
    // same isGemstone-based default Settings itself uses for a brand-new row.
    const primaryUnitRaw = String(formData.get("primaryUnit") || "");
    const primaryUnit: WeightUnit =
      primaryUnitRaw === "CARAT"
        ? WeightUnit.CARAT
        : primaryUnitRaw === "GRAM"
          ? WeightUnit.GRAM
          : isGemstone
            ? WeightUnit.CARAT
            : WeightUnit.GRAM;

    const errors: Record<string, string[]> = {};
    if (!name) errors.name = ["Name is required"];

    if (Object.keys(errors).length > 0) {
      return { success: false, message: "Please fix the form errors", errors };
    }

    const storeId = await requireStoreScope();

    const existing = await prisma.storeMetal.findFirst({
      where: { storeId, name, NOT: id ? { id } : undefined },
      select: { id: true, isGemstone: true, isActive: true },
    });

    if (existing) {
      // Metals and Stones share this one table, so the clash may be in the
      // other section, or a row that's been turned off — say which, or the
      // owner looks in the list they're editing and finds nothing.
      const section = existing.isGemstone ? "Stones" : "Metals";
      const message = `"${name}" already exists under ${section}${
        existing.isActive ? "" : " (turned off — switch it back on instead)"
      }`;
      return { success: false, message, errors: { name: [message] } };
    }

    let savedId = id;

    if (id) {
      // Selling Price is no longer editable at the Metal/Stone level (retired
      // in favor of per-Purity/per-Stone-Type Selling Price) — deliberately
      // left out of this update so a metal/stone's pre-existing flat rate,
      // still read as resolveStockSellingRate's (lib/purity.ts) last-resort
      // fallback, isn't silently wiped out by an unrelated edit.
      const { count } = await prisma.storeMetal.updateMany({
        where: { id, storeId },
        data: { name, hasPurity, isGemstone, primaryUnit },
      });

      if (count === 0) {
        return { success: false, message: isGemstone ? "Stone not found" : "Metal not found" };
      }
    } else {
      const created = await prisma.storeMetal.create({
        data: { storeId, name, hasPurity, isGemstone, primaryUnit },
        select: { id: true },
      });
      savedId = created.id;
    }

    revalidatePath(TAXONOMY_PATH);

    updateTag(sellingRatesTag(storeId));

    return {
      success: true,
      id: savedId,
      message: isGemstone
        ? id
          ? "Stone updated successfully"
          : "Stone added successfully"
        : id
          ? "Metal updated successfully"
          : "Metal added successfully",
    };
  } catch (error: any) {
    if (error?.code === "P2002") {
      return {
        success: false,
        message: "A metal with this name already exists",
        errors: { name: ["A metal with this name already exists"] },
      };
    }
    logger.error("upsertStoreMetal error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to save metal") };
  }
}

export async function toggleStoreMetalActive(
  id: string,
  isActive: boolean,
): Promise<TaxonomyFormState> {
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

    const { count } = await prisma.storeMetal.updateMany({
      where: { id, storeId },
      data: { isActive },
    });

    if (count === 0) {
      return { success: false, message: "Metal not found" };
    }

    revalidatePath(TAXONOMY_PATH);

    updateTag(sellingRatesTag(storeId));

    return {
      success: true,
      message: isActive ? "Metal activated" : "Metal deactivated",
    };
  } catch (error) {
    logger.error("toggleStoreMetalActive error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to update metal") };
  }
}

/**
 * Deletes a metal type only when nothing references it — across every
 * record type that carries a metalTypeId, not just Product. Blocking on
 * ANY of these (not just the obvious ones) matters because a metal used
 * only by, say, historical invoice lines but no live product would
 * otherwise look "unused" and silently orphan real financial history.
 * Disabling (toggleStoreMetalActive) is the reversible alternative for a
 * metal that's ever been used at all.
 *
 * Its origins (StoreMetalOrigin rows) cascade-delete with it, same as a
 * StoreCategoryType cascades with its StoreCategory — which is exactly why
 * each origin's own product count is checked here too, not just the metal's
 * direct product count: see deleteStoreCategory's identical reasoning for
 * its types.
 */
export async function deleteStoreMetal(id: string): Promise<TaxonomyFormState> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return { success: false, message: "Only a Store Admin or Super Admin can delete a metal type." };
  }

  try {
    const storeId = await requireStoreScope();

    const metal = await prisma.storeMetal.findFirst({
      where: { id, storeId },
      include: {
        _count: {
          select: {
            products: true,
            inventoryStocks: true,
            kachaInvoiceItems: true,
            invoiceItems: true,
            ledgerEntries: true,
            karigarJobs: true,
            purchaseItems: true,
            karigarReceiptItems: true,
            quotationItems: true,
          },
        },
        origins: { include: { _count: { select: { products: true } } } },
      },
    });

    if (!metal) return { success: false, message: "Metal type not found" };

    const originUsage = metal.origins.reduce((sum, o) => sum + o._count.products, 0);
    const usageCount =
      Object.values(metal._count).reduce((sum, n) => sum + n, 0) + originUsage;
    if (usageCount > 0) {
      return {
        success: false,
        message: `This metal type is used by ${usageCount} existing record(s) and cannot be deleted. Disable it instead.`,
      };
    }

    await prisma.storeMetal.delete({ where: { id } });
    revalidatePath(TAXONOMY_PATH);
    updateTag(sellingRatesTag(storeId));

    return { success: true, message: "Metal type deleted" };
  } catch (error) {
    logger.error("deleteStoreMetal error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to delete metal type") };
  }
}

/**
 * Moves a row from the Metals section to Stones — for a store that set up
 * e.g. "Diamond" as a Metal, which then never shows in any Stone picker and
 * blocks adding a Stone of the same name. Only while nothing uses it: an
 * existing product/stock/invoice line on it was weighed in grams with a
 * purity, and flipping it under them would change their weight math.
 */
export async function moveStoreMetalToStones(id: string): Promise<TaxonomyFormState> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return { success: false, message: "Only the Store Owner can update these settings." };
  }

  try {
    const storeId = await requireStoreScope();

    const metal = await prisma.storeMetal.findFirst({
      where: { id, storeId },
      include: {
        _count: {
          select: {
            products: true,
            inventoryStocks: true,
            kachaInvoiceItems: true,
            invoiceItems: true,
            ledgerEntries: true,
            karigarJobs: true,
            purchaseItems: true,
            karigarReceiptItems: true,
            quotationItems: true,
          },
        },
      },
    });

    if (!metal) return { success: false, message: "Metal not found" };
    if (metal.isGemstone) return { success: false, message: `"${metal.name}" is already a Stone` };

    const usageCount = Object.values(metal._count).reduce((sum, n) => sum + n, 0);
    if (usageCount > 0) {
      return {
        success: false,
        message: `"${metal.name}" is used by ${usageCount} existing record(s) as a metal, so it can't be moved. Turn it off and add a new Stone with a different name instead.`,
      };
    }

    await prisma.storeMetal.update({
      where: { id },
      data: { isGemstone: true, hasPurity: false, primaryUnit: WeightUnit.CARAT },
    });
    revalidatePath(TAXONOMY_PATH);
    updateTag(sellingRatesTag(storeId));

    return { success: true, message: `"${metal.name}" moved to Stones — add its Stone Types next` };
  } catch (error) {
    logger.error("moveStoreMetalToStones error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to move metal") };
  }
}

// ---------------------------------------------------------------------------
// Store Metal Origins (cascading under a gemstone Stone) — user-facing label
// is "Stone Types". Free text, Store-Admin-managed, exactly like Store
// Category Types below (was a fixed Natural/Lab-Grown enum until 2026-09 —
// see StoreMetalOrigin's schema doc comment).
// ---------------------------------------------------------------------------
//
// Mirrors the Store Category Types section below exactly: a Stone's own
// list of Stone Type options, managed the same way a Category's Types are.

/**
 * Every Stone Type across every Stone in the store, in one call — for a
 * picker (billing/purchase/kacha/quotation line items) that needs to filter
 * by whichever Stone gets picked without a fetch per selection, unlike
 * getStoreMetalOrigins below (Settings' Taxonomy page only ever needs one
 * Stone's options at a time, since it edits one at a time).
 */
export async function getAllStoreMetalOrigins(): Promise<StoreMetalOriginRow[]> {
  const storeId = await requireStoreScope();

  const origins = await prisma.storeMetalOrigin.findMany({
    where: { storeId },
    orderBy: { name: "asc" },
  });

  return origins.map((option) => ({
    id: option.id,
    storeMetalId: option.storeMetalId,
    name: option.name,
    isActive: option.isActive,
    gramsPerCarat: Number(option.gramsPerCarat),
    sellingPrice: option.sellingPrice != null ? Number(option.sellingPrice) : null,
  }));
}

export async function getStoreMetalOrigins(
  storeMetalId: string,
): Promise<StoreMetalOriginRow[]> {
  const storeId = await getStoreIdForRead();

  if (!storeMetalId) return [];

  const origins = await prisma.storeMetalOrigin.findMany({
    where: { storeMetalId, storeId },
    orderBy: { name: "asc" },
  });

  return origins.map((option) => ({
    id: option.id,
    storeMetalId: option.storeMetalId,
    name: option.name,
    isActive: option.isActive,
    gramsPerCarat: Number(option.gramsPerCarat),
    sellingPrice: option.sellingPrice != null ? Number(option.sellingPrice) : null,
  }));
}

export async function upsertStoreMetalOrigin(
  prevState: TaxonomyFormState,
  formData: FormData,
): Promise<TaxonomyFormState> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return {
      success: false,
      message: "Only the Store Owner can update these settings.",
    };
  }

  try {
    const id = String(formData.get("id") || "").trim();
    const storeMetalId = String(formData.get("storeMetalId") || "").trim();
    const name = String(formData.get("name") || "").trim();
    const gramsPerCaratRaw = String(formData.get("gramsPerCarat") || "").trim();
    const sellingPriceRaw = String(formData.get("sellingPrice") || "").trim();
    const gramsPerCarat = gramsPerCaratRaw ? Number(gramsPerCaratRaw) : 0.2;
    const sellingPrice = sellingPriceRaw ? Number(sellingPriceRaw) : null;

    const errors: Record<string, string[]> = {};
    if (!storeMetalId) errors.storeMetalId = ["Stone is required"];
    if (!name) errors.name = ["Type name is required"];
    else if (name.length > 60) errors.name = ["Type name must be 60 characters or fewer"];
    if (!Number.isFinite(gramsPerCarat) || gramsPerCarat <= 0) {
      errors.gramsPerCarat = ["Grams per carat must be a positive number"];
    }

    if (Object.keys(errors).length > 0) {
      return { success: false, message: "Please fix the form errors", errors };
    }

    const storeId = await requireStoreScope();

    const stone = await prisma.storeMetal.findFirst({
      where: { id: storeMetalId, storeId },
      select: { id: true },
    });

    if (!stone) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors: { storeMetalId: ["Stone not found"] },
      };
    }

    const existing = await prisma.storeMetalOrigin.findFirst({
      where: { storeMetalId, name, NOT: id ? { id } : undefined },
      select: { id: true },
    });

    if (existing) {
      return {
        success: false,
        message: "A type with this name already exists for this stone",
        errors: {
          name: ["A type with this name already exists for this stone"],
        },
      };
    }

    let savedId = id;

    const saved = await saveWithRateHistory(storeId, "stoneType", id, async (tx) => {
      if (id) {
        const { count } = await tx.storeMetalOrigin.updateMany({
          where: { id, storeId },
          data: { name, storeMetalId, gramsPerCarat, sellingPrice },
        });
        return count === 0 ? null : id;
      }
      const created = await tx.storeMetalOrigin.create({
        data: { storeId, storeMetalId, name, gramsPerCarat, sellingPrice },
        select: { id: true },
      });
      return created.id;
    }, sellingPrice);

    if (!saved) {
      return { success: false, message: "Stone Type not found" };
    }
    savedId = saved;

    revalidatePath(TAXONOMY_PATH);

    updateTag(sellingRatesTag(storeId));

    return {
      success: true,
      id: savedId,
      message: id ? "Stone Type updated successfully" : "Stone Type added successfully",
    };
  } catch (error: any) {
    if (error?.code === "P2002") {
      return {
        success: false,
        message: "A type with this name already exists for this stone",
        errors: {
          name: ["A type with this name already exists for this stone"],
        },
      };
    }
    logger.error("upsertStoreMetalOrigin error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to save Stone Type") };
  }
}

export async function toggleStoreMetalOriginActive(
  id: string,
  isActive: boolean,
): Promise<TaxonomyFormState> {
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

    const { count } = await prisma.storeMetalOrigin.updateMany({
      where: { id, storeId },
      data: { isActive },
    });

    if (count === 0) {
      return { success: false, message: "Stone Type not found" };
    }

    revalidatePath(TAXONOMY_PATH);

    updateTag(sellingRatesTag(storeId));

    return {
      success: true,
      message: isActive ? "Stone Type activated" : "Stone Type deactivated",
    };
  } catch (error) {
    logger.error("toggleStoreMetalOriginActive error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to update Stone Type") };
  }
}

export async function deleteStoreMetalOrigin(id: string): Promise<TaxonomyFormState> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return { success: false, message: "Only a Store Admin or Super Admin can delete a Stone Type." };
  }

  try {
    const storeId = await requireStoreScope();

    const option = await prisma.storeMetalOrigin.findFirst({
      where: { id, storeId },
      include: { _count: { select: { products: true } } },
    });

    if (!option) return { success: false, message: "Stone Type not found" };

    if (option._count.products > 0) {
      return {
        success: false,
        message: `This Stone Type is used by ${option._count.products} product(s) and cannot be deleted. Disable it instead.`,
      };
    }

    await prisma.storeMetalOrigin.delete({ where: { id } });
    revalidatePath(TAXONOMY_PATH);
    updateTag(sellingRatesTag(storeId));

    return { success: true, message: "Stone Type deleted" };
  } catch (error) {
    logger.error("deleteStoreMetalOrigin error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to delete Stone Type") };
  }
}

// ---------------------------------------------------------------------------
// Store Metal Purities — real per-Metal Purity options (Gold -> 18K/20K/
// 22K/24K, etc), replacing the old global PurityType enum. Mirrors the
// Store Metal Origins ("Stone Types") CRUD above exactly, just scoped to a
// hasPurity Metal instead of a gemstone.
// ---------------------------------------------------------------------------

export async function getStoreMetalPurities(
  storeMetalId: string,
): Promise<StoreMetalPurityRow[]> {
  const storeId = await getStoreIdForRead();

  if (!storeMetalId) return [];

  const purities = await prisma.storeMetalPurity.findMany({
    where: { storeMetalId, storeId },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });

  return purities.map((row) => ({
    id: row.id,
    storeMetalId: row.storeMetalId,
    label: row.label,
    skuCode: row.skuCode,
    finenessPercent: Number(row.finenessPercent),
    sellingPrice: row.sellingPrice != null ? Number(row.sellingPrice) : null,
    isHallmarkable: row.isHallmarkable,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  }));
}

export async function upsertStoreMetalPurity(
  prevState: TaxonomyFormState,
  formData: FormData,
): Promise<TaxonomyFormState> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return {
      success: false,
      message: "Only the Store Owner can update these settings.",
    };
  }

  try {
    const id = String(formData.get("id") || "").trim();
    const storeMetalId = String(formData.get("storeMetalId") || "").trim();
    const label = String(formData.get("label") || "").trim();
    const skuCode = String(formData.get("skuCode") || "").trim();
    const finenessPercentRaw = String(formData.get("finenessPercent") || "").trim();
    const sellingPriceRaw = String(formData.get("sellingPrice") || "").trim();
    const isHallmarkable = formData.get("isHallmarkable") === "true";
    // Blank isn't "100%": it's filled from the label once the metal is
    // known (defaultFinenessForLabel below), so a "22K" added without a
    // figure doesn't count as pure gold in every fine-weight total.
    let finenessPercent = finenessPercentRaw ? Number(finenessPercentRaw) : 100;
    const sellingPrice = sellingPriceRaw ? Number(sellingPriceRaw) : null;

    const errors: Record<string, string[]> = {};
    if (!storeMetalId) errors.storeMetalId = ["Metal is required"];
    if (!label) errors.label = ["Purity label is required"];
    else if (label.length > 40) errors.label = ["Purity label must be 40 characters or fewer"];
    if (!skuCode) errors.skuCode = ["SKU code is required"];
    else if (skuCode.length > 20) errors.skuCode = ["SKU code must be 20 characters or fewer"];
    if (!Number.isFinite(finenessPercent) || finenessPercent <= 0 || finenessPercent > 100) {
      errors.finenessPercent = ["Fineness must be between 0 and 100"];
    }

    if (Object.keys(errors).length > 0) {
      return { success: false, message: "Please fix the form errors", errors };
    }

    const storeId = await requireStoreScope();

    const metal = await prisma.storeMetal.findFirst({
      where: { id: storeMetalId, storeId },
      select: { id: true, name: true },
    });

    if (!metal) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors: { storeMetalId: ["Metal not found"] },
      };
    }

    if (!finenessPercentRaw) finenessPercent = defaultFinenessForLabel(metal.name, label);

    const existing = await prisma.storeMetalPurity.findFirst({
      where: { storeMetalId, label, NOT: id ? { id } : undefined },
      select: { id: true },
    });

    if (existing) {
      return {
        success: false,
        message: "A purity with this label already exists for this metal",
        errors: {
          label: ["A purity with this label already exists for this metal"],
        },
      };
    }

    let savedId = id;
    const data = { label, skuCode, finenessPercent, sellingPrice, isHallmarkable, storeMetalId };

    const saved = await saveWithRateHistory(storeId, "purity", id, async (tx) => {
      if (id) {
        const { count } = await tx.storeMetalPurity.updateMany({
          where: { id, storeId },
          data,
        });
        return count === 0 ? null : id;
      }
      const created = await tx.storeMetalPurity.create({
        data: { storeId, ...data },
        select: { id: true },
      });
      return created.id;
    }, sellingPrice);

    if (!saved) {
      return { success: false, message: "Purity not found" };
    }
    savedId = saved;

    revalidatePath(TAXONOMY_PATH);

    updateTag(sellingRatesTag(storeId));

    return {
      success: true,
      id: savedId,
      message: id ? "Purity updated successfully" : "Purity added successfully",
    };
  } catch (error: any) {
    if (error?.code === "P2002") {
      return {
        success: false,
        message: "A purity with this label already exists for this metal",
        errors: {
          label: ["A purity with this label already exists for this metal"],
        },
      };
    }
    logger.error("upsertStoreMetalPurity error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to save purity") };
  }
}

export async function toggleStoreMetalPurityActive(
  id: string,
  isActive: boolean,
): Promise<TaxonomyFormState> {
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

    const { count } = await prisma.storeMetalPurity.updateMany({
      where: { id, storeId },
      data: { isActive },
    });

    if (count === 0) {
      return { success: false, message: "Purity not found" };
    }

    revalidatePath(TAXONOMY_PATH);

    updateTag(sellingRatesTag(storeId));

    return {
      success: true,
      message: isActive ? "Purity activated" : "Purity deactivated",
    };
  } catch (error) {
    logger.error("toggleStoreMetalPurityActive error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to update purity") };
  }
}

export async function deleteStoreMetalPurity(id: string): Promise<TaxonomyFormState> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return { success: false, message: "Only a Store Admin or Super Admin can delete a purity." };
  }

  try {
    const storeId = await requireStoreScope();

    const row = await prisma.storeMetalPurity.findFirst({
      where: { id, storeId },
      include: { _count: { select: { products: true } } },
    });

    if (!row) return { success: false, message: "Purity not found" };

    if (row._count.products > 0) {
      return {
        success: false,
        message: `This purity is used by ${row._count.products} product(s) and cannot be deleted. Disable it instead.`,
      };
    }

    await prisma.storeMetalPurity.delete({ where: { id } });
    revalidatePath(TAXONOMY_PATH);
    updateTag(sellingRatesTag(storeId));

    return { success: true, message: "Purity deleted" };
  } catch (error) {
    logger.error("deleteStoreMetalPurity error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to delete purity") };
  }
}

// A purity whose saved fineness disagrees with what its label implies (a
// "22K" at 100%) — every pure-weight total would be off. Settings flags
// them (lib/purity-fineness-check.ts) and offers a one-click fix.
export type MisconfiguredPurityRow = {
  id: string;
  storeMetalId: string;
  metalName: string;
  label: string;
  finenessPercent: number;
  expectedFinenessPercent: number;
};

export async function getMisconfiguredPurities(): Promise<MisconfiguredPurityRow[]> {
  const storeId = await getStoreIdForRead();

  const purities = await prisma.storeMetalPurity.findMany({
    where: { storeId, storeMetal: { hasPurity: true } },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: {
      id: true,
      storeMetalId: true,
      label: true,
      finenessPercent: true,
      storeMetal: { select: { name: true } },
    },
  });

  return purities.flatMap((row) => {
    const finenessPercent = Number(row.finenessPercent);
    const expected = finenessMismatch(row.storeMetal.name, row.label, finenessPercent);
    return expected == null
      ? []
      : [
          {
            id: row.id,
            storeMetalId: row.storeMetalId,
            metalName: row.storeMetal.name,
            label: row.label,
            finenessPercent,
            expectedFinenessPercent: expected,
          },
        ];
  });
}

/**
 * Resets one purity's fineness to the standard figure its label implies,
 * recomputed here (never trusted from the client).
 */
export async function fixPurityFineness(id: string): Promise<TaxonomyFormState> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return { success: false, message: "Only the Store Owner can update these settings." };
  }

  try {
    const storeId = await requireStoreScope();

    const row = await prisma.storeMetalPurity.findFirst({
      where: { id, storeId },
      select: { label: true, storeMetal: { select: { name: true } } },
    });
    if (!row) return { success: false, message: "Purity not found" };

    const expected = expectedFinenessForLabel(row.storeMetal.name, row.label);
    if (expected == null) {
      return { success: false, message: `"${row.label}" has no standard fineness — set it by hand.` };
    }

    const { count } = await prisma.storeMetalPurity.updateMany({
      where: { id, storeId },
      data: { finenessPercent: expected },
    });
    if (count === 0) return { success: false, message: "Purity not found" };

    revalidatePath(TAXONOMY_PATH);

    updateTag(sellingRatesTag(storeId));

    return { success: true, id, message: `${row.storeMetal.name} ${row.label} set to ${expected}% fine` };
  } catch (error) {
    logger.error("fixPurityFineness error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to fix purity fineness") };
  }
}

// ---------------------------------------------------------------------------
// Store Categories
// ---------------------------------------------------------------------------

export async function getStoreCategories(): Promise<StoreCategoryRow[]> {
  const storeId = await requireStoreScope();

  const categories = await prisma.storeCategory.findMany({
    where: { storeId },
    orderBy: { name: "asc" },
    include: { metalTags: { select: { storeMetalId: true } } },
  });

  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    isActive: category.isActive,
    metalTagIds: category.metalTags.map((tag) => tag.storeMetalId),
  }));
}

export type CategoryFilterOptions = {
  /** metalTagIds: the metals this category is tagged to (Settings >
   *  Taxonomy); empty = universal, same rule as getStoreCategoriesForMetal. */
  categories: { value: string; label: string; metalTagIds: string[] }[];
  categoryTypes: { value: string; label: string; categoryId: string }[];
  /** Metals that are stones (isGemstone) — for these the filter swaps
   *  Category/Type for Stone Type, same as Add Product hides Category for
   *  a Stone product. */
  gemstoneMetalIds: string[];
  /** Each stone's own Stone Type options (StoreMetalOrigin, e.g. Natural /
   *  Lab-Grown) — what Product.stoneOriginOptionId points at. */
  stoneTypes: { value: string; label: string; metalId: string }[];
};

/**
 * Every active Category and Category Type in one call, for the Products/
 * Stock toolbars' Category → Type filter (DataTableToolbar's
 * categoryOptions/categoryTypeOptions). Types are loaded up front, not per
 * pick like getStoreCategoryTypes, since the toolbar filters them locally.
 */
export async function getCategoryFilterOptions(): Promise<CategoryFilterOptions> {
  const storeId = await requireStoreScope();

  const [categories, types, gemstones, origins] = await Promise.all([
    prisma.storeCategory.findMany({
      where: { storeId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, metalTags: { select: { storeMetalId: true } } },
    }),
    prisma.storeCategoryType.findMany({
      where: { storeId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, categoryId: true },
    }),
    prisma.storeMetal.findMany({
      where: { storeId, isActive: true, isGemstone: true },
      select: { id: true },
    }),
    prisma.storeMetalOrigin.findMany({
      where: { storeId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, storeMetalId: true },
    }),
  ]);

  return {
    categories: categories.map((category) => ({
      value: category.id,
      label: category.name,
      metalTagIds: category.metalTags.map((tag) => tag.storeMetalId),
    })),
    categoryTypes: types.map((type) => ({ value: type.id, label: type.name, categoryId: type.categoryId })),
    gemstoneMetalIds: gemstones.map((metal) => metal.id),
    stoneTypes: origins.map((origin) => ({
      value: origin.id,
      label: origin.name,
      metalId: origin.storeMetalId,
    })),
  };
}

/**
 * Which Categories are usable for a given Metal — every category with no
 * tags at all (universal) plus any tagged specifically to this metal. Used
 * by the entry forms (Product/Purchase/Invoice/...) to filter the Category
 * picker once a Metal/Stone is chosen; getStoreCategories above (untargeted)
 * is what Settings > Taxonomy itself uses to manage the full list + tags.
 */
export async function getStoreCategoriesForMetal(
  storeMetalId: string,
): Promise<StoreCategoryRow[]> {
  if (!storeMetalId) return getStoreCategories();

  const storeId = await getStoreIdForRead();

  const categories = await prisma.storeCategory.findMany({
    where: {
      storeId,
      OR: [{ metalTags: { none: {} } }, { metalTags: { some: { storeMetalId } } }],
    },
    orderBy: { name: "asc" },
    include: { metalTags: { select: { storeMetalId: true } } },
  });

  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    isActive: category.isActive,
    metalTagIds: category.metalTags.map((tag) => tag.storeMetalId),
  }));
}

/**
 * Replaces a Category's full set of "applicable metals" tags in one call —
 * simpler for a multiselect UI than diffing add/remove one at a time.
 * Passing an empty array makes the category universal again.
 */
export async function updateStoreCategoryMetalTags(
  categoryId: string,
  storeMetalIds: string[],
): Promise<TaxonomyFormState> {
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

    const category = await prisma.storeCategory.findFirst({
      where: { id: categoryId, storeId },
      select: { id: true },
    });

    if (!category) return { success: false, message: "Category not found" };

    await prisma.$transaction([
      prisma.storeCategoryMetal.deleteMany({ where: { storeCategoryId: categoryId } }),
      ...(storeMetalIds.length > 0
        ? [
            prisma.storeCategoryMetal.createMany({
              data: storeMetalIds.map((storeMetalId) => ({ storeCategoryId: categoryId, storeMetalId })),
            }),
          ]
        : []),
    ]);

    revalidatePath(TAXONOMY_PATH);

    return { success: true, message: "Applicable metals updated" };
  } catch (error) {
    logger.error("updateStoreCategoryMetalTags error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to update applicable metals") };
  }
}

export async function upsertStoreCategory(
  prevState: TaxonomyFormState,
  formData: FormData,
): Promise<TaxonomyFormState> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return {
      success: false,
      message: "Only the Store Owner can update these settings.",
    };
  }

  try {
    const id = String(formData.get("id") || "").trim();
    const name = String(formData.get("name") || "").trim();

    if (!name) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors: { name: ["Category name is required"] },
      };
    }

    const storeId = await requireStoreScope();

    const existing = await prisma.storeCategory.findFirst({
      where: { storeId, name, NOT: id ? { id } : undefined },
      select: { id: true },
    });

    if (existing) {
      return {
        success: false,
        message: "A category with this name already exists",
        errors: { name: ["A category with this name already exists"] },
      };
    }

    let savedId = id;

    if (id) {
      const { count } = await prisma.storeCategory.updateMany({
        where: { id, storeId },
        data: { name },
      });

      if (count === 0) {
        return { success: false, message: "Category not found" };
      }
    } else {
      const created = await prisma.storeCategory.create({
        data: { storeId, name },
        select: { id: true },
      });
      savedId = created.id;
    }

    revalidatePath(TAXONOMY_PATH);

    return {
      success: true,
      id: savedId,
      message: id
        ? "Category updated successfully"
        : "Category added successfully",
    };
  } catch (error: any) {
    if (error?.code === "P2002") {
      return {
        success: false,
        message: "A category with this name already exists",
        errors: { name: ["A category with this name already exists"] },
      };
    }
    logger.error("upsertStoreCategory error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to save category") };
  }
}

export async function toggleStoreCategoryActive(
  id: string,
  isActive: boolean,
): Promise<TaxonomyFormState> {
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

    const { count } = await prisma.storeCategory.updateMany({
      where: { id, storeId },
      data: { isActive },
    });

    if (count === 0) {
      return { success: false, message: "Category not found" };
    }

    revalidatePath(TAXONOMY_PATH);

    return {
      success: true,
      message: isActive ? "Category activated" : "Category deactivated",
    };
  } catch (error) {
    logger.error("toggleStoreCategoryActive error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to update category") };
  }
}

/**
 * Deletes a category only when it has no products directly on it AND none
 * of its own types have any products either. Its types cascade-delete with
 * it (see StoreCategoryType.category's onDelete: Cascade) — that cascade is
 * exactly why a type-level check is required here too, not just the
 * category's own direct product count: a category with zero of its own
 * products can still have a type underneath it that products actually use.
 */
export async function deleteStoreCategory(id: string): Promise<TaxonomyFormState> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return { success: false, message: "Only a Store Admin or Super Admin can delete a category." };
  }

  try {
    const storeId = await requireStoreScope();

    const category = await prisma.storeCategory.findFirst({
      where: { id, storeId },
      include: {
        _count: { select: { products: true } },
        types: { include: { _count: { select: { products: true } } } },
      },
    });

    if (!category) return { success: false, message: "Category not found" };

    const typeUsage = category.types.reduce((sum, t) => sum + t._count.products, 0);
    const usageCount = category._count.products + typeUsage;
    if (usageCount > 0) {
      return {
        success: false,
        message: `This category (or one of its types) is used by ${usageCount} product(s) and cannot be deleted. Disable it instead.`,
      };
    }

    await prisma.storeCategory.delete({ where: { id } });
    revalidatePath(TAXONOMY_PATH);

    return { success: true, message: "Category deleted" };
  } catch (error) {
    logger.error("deleteStoreCategory error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to delete category") };
  }
}

// ---------------------------------------------------------------------------
// Store Styles ("Ladies"/"Gents"/"Kids"/"Unisex" by default, store-managed —
// see Product.targetStyleId's own schema comment). Same 4-function CRUD
// shape as StoreCategory above, minus a sub-level (Style never needed one).
// ---------------------------------------------------------------------------

export async function getStoreStyles(): Promise<StoreStyleRow[]> {
  const storeId = await requireStoreScope();

  const styles = await prisma.storeStyle.findMany({
    where: { storeId },
    orderBy: { name: "asc" },
  });

  return styles.map((style) => ({
    id: style.id,
    name: style.name,
    isActive: style.isActive,
  }));
}

export async function upsertStoreStyle(
  prevState: TaxonomyFormState,
  formData: FormData,
): Promise<TaxonomyFormState> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return {
      success: false,
      message: "Only the Store Owner can update these settings.",
    };
  }

  try {
    const id = String(formData.get("id") || "").trim();
    const name = String(formData.get("name") || "").trim();

    if (!name) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors: { name: ["Style name is required"] },
      };
    }

    const storeId = await requireStoreScope();

    const existing = await prisma.storeStyle.findFirst({
      where: { storeId, name, NOT: id ? { id } : undefined },
      select: { id: true },
    });

    if (existing) {
      return {
        success: false,
        message: "A style with this name already exists",
        errors: { name: ["A style with this name already exists"] },
      };
    }

    let savedId = id;

    if (id) {
      const { count } = await prisma.storeStyle.updateMany({
        where: { id, storeId },
        data: { name },
      });

      if (count === 0) {
        return { success: false, message: "Style not found" };
      }
    } else {
      const created = await prisma.storeStyle.create({
        data: { storeId, name },
        select: { id: true },
      });
      savedId = created.id;
    }

    revalidatePath(TAXONOMY_PATH);

    return {
      success: true,
      id: savedId,
      message: id ? "Style updated successfully" : "Style added successfully",
    };
  } catch (error: any) {
    if (error?.code === "P2002") {
      return {
        success: false,
        message: "A style with this name already exists",
        errors: { name: ["A style with this name already exists"] },
      };
    }
    logger.error("upsertStoreStyle error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to save style") };
  }
}

export async function toggleStoreStyleActive(
  id: string,
  isActive: boolean,
): Promise<TaxonomyFormState> {
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

    const { count } = await prisma.storeStyle.updateMany({
      where: { id, storeId },
      data: { isActive },
    });

    if (count === 0) {
      return { success: false, message: "Style not found" };
    }

    revalidatePath(TAXONOMY_PATH);

    return {
      success: true,
      message: isActive ? "Style activated" : "Style deactivated",
    };
  } catch (error) {
    logger.error("toggleStoreStyleActive error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to update style") };
  }
}

export async function deleteStoreStyle(id: string): Promise<TaxonomyFormState> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return { success: false, message: "Only a Store Admin or Super Admin can delete a style." };
  }

  try {
    const storeId = await requireStoreScope();

    const style = await prisma.storeStyle.findFirst({
      where: { id, storeId },
      include: { _count: { select: { products: true } } },
    });

    if (!style) return { success: false, message: "Style not found" };

    if (style._count.products > 0) {
      return {
        success: false,
        message: `This style is used by ${style._count.products} product(s) and cannot be deleted. Disable it instead.`,
      };
    }

    await prisma.storeStyle.delete({ where: { id } });
    revalidatePath(TAXONOMY_PATH);

    return { success: true, message: "Style deleted" };
  } catch (error) {
    logger.error("deleteStoreStyle error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to delete style") };
  }
}

// ---------------------------------------------------------------------------
// Store Stone Clarities (e.g. "FG/VVS-VS") — same CRUD shape as Styles above.
// ---------------------------------------------------------------------------

export async function getStoreStoneClarities(): Promise<StoreStoneClarityRow[]> {
  const storeId = await requireStoreScope();

  const clarities = await prisma.storeStoneClarity.findMany({
    where: { storeId },
    orderBy: { name: "asc" },
  });

  return clarities.map((style) => ({
    id: style.id,
    name: style.name,
    isActive: style.isActive,
  }));
}

export async function upsertStoreStoneClarity(
  prevState: TaxonomyFormState,
  formData: FormData,
): Promise<TaxonomyFormState> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return {
      success: false,
      message: "Only the Store Owner can update these settings.",
    };
  }

  try {
    const id = String(formData.get("id") || "").trim();
    const name = String(formData.get("name") || "").trim();

    if (!name) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors: { name: ["Clarity is required"] },
      };
    }

    const storeId = await requireStoreScope();

    const existing = await prisma.storeStoneClarity.findFirst({
      where: { storeId, name, NOT: id ? { id } : undefined },
      select: { id: true },
    });

    if (existing) {
      return {
        success: false,
        message: "This clarity already exists",
        errors: { name: ["This clarity already exists"] },
      };
    }

    let savedId = id;

    if (id) {
      const { count } = await prisma.storeStoneClarity.updateMany({
        where: { id, storeId },
        data: { name },
      });

      if (count === 0) {
        return { success: false, message: "Clarity not found" };
      }
    } else {
      const created = await prisma.storeStoneClarity.create({
        data: { storeId, name },
        select: { id: true },
      });
      savedId = created.id;
    }

    revalidatePath(TAXONOMY_PATH);

    return {
      success: true,
      id: savedId,
      message: id ? "Clarity updated" : "Clarity added",
    };
  } catch (error: any) {
    if (error?.code === "P2002") {
      return {
        success: false,
        message: "This clarity already exists",
        errors: { name: ["This clarity already exists"] },
      };
    }
    logger.error("upsertStoreStoneClarity error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to save clarity") };
  }
}

export async function toggleStoreStoneClarityActive(
  id: string,
  isActive: boolean,
): Promise<TaxonomyFormState> {
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

    const { count } = await prisma.storeStoneClarity.updateMany({
      where: { id, storeId },
      data: { isActive },
    });

    if (count === 0) {
      return { success: false, message: "Clarity not found" };
    }

    revalidatePath(TAXONOMY_PATH);

    return {
      success: true,
      message: isActive ? "Clarity activated" : "Clarity deactivated",
    };
  } catch (error) {
    logger.error("toggleStoreStoneClarityActive error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to update clarity") };
  }
}

export async function deleteStoreStoneClarity(id: string): Promise<TaxonomyFormState> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return { success: false, message: "Only a Store Admin or Super Admin can delete a clarity." };
  }

  try {
    const storeId = await requireStoreScope();

    const style = await prisma.storeStoneClarity.findFirst({ where: { id, storeId } });

    if (!style) return { success: false, message: "Clarity not found" };

    // Products keep the clarity as text, not an FK — count by name.
    const usedBy = await prisma.productStoneComponent.count({
      where: { clarity: style.name, product: { storeId } },
    });
    if (usedBy > 0) {
      return {
        success: false,
        message: `This clarity is used on ${usedBy} product stone row(s) and cannot be deleted. Disable it instead.`,
      };
    }

    await prisma.storeStoneClarity.delete({ where: { id } });
    revalidatePath(TAXONOMY_PATH);

    return { success: true, message: "Clarity deleted" };
  } catch (error) {
    logger.error("deleteStoreStoneClarity error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to delete clarity") };
  }
}

// ---------------------------------------------------------------------------
// Store Category Types (cascading under a Category)
// ---------------------------------------------------------------------------

export async function getStoreCategoryTypes(
  categoryId: string,
): Promise<StoreCategoryTypeRow[]> {
  const storeId = await getStoreIdForRead();

  if (!categoryId) return [];

  const types = await prisma.storeCategoryType.findMany({
    where: { categoryId, storeId },
    orderBy: { name: "asc" },
  });

  return types.map((type) => ({
    id: type.id,
    categoryId: type.categoryId,
    name: type.name,
    isActive: type.isActive,
  }));
}

export async function upsertStoreCategoryType(
  prevState: TaxonomyFormState,
  formData: FormData,
): Promise<TaxonomyFormState> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return {
      success: false,
      message: "Only the Store Owner can update these settings.",
    };
  }

  try {
    const id = String(formData.get("id") || "").trim();
    const categoryId = String(formData.get("categoryId") || "").trim();
    const name = String(formData.get("name") || "").trim();

    const errors: Record<string, string[]> = {};
    if (!categoryId) errors.categoryId = ["Category is required"];
    if (!name) errors.name = ["Type name is required"];

    if (Object.keys(errors).length > 0) {
      return { success: false, message: "Please fix the form errors", errors };
    }

    const storeId = await requireStoreScope();

    const category = await prisma.storeCategory.findFirst({
      where: { id: categoryId, storeId },
      select: { id: true },
    });

    if (!category) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors: { categoryId: ["Category not found"] },
      };
    }

    const existing = await prisma.storeCategoryType.findFirst({
      where: { categoryId, name, NOT: id ? { id } : undefined },
      select: { id: true },
    });

    if (existing) {
      return {
        success: false,
        message: "A type with this name already exists in this category",
        errors: {
          name: ["A type with this name already exists in this category"],
        },
      };
    }

    let savedId = id;

    if (id) {
      const { count } = await prisma.storeCategoryType.updateMany({
        where: { id, storeId },
        data: { name, categoryId },
      });

      if (count === 0) {
        return { success: false, message: "Type not found" };
      }
    } else {
      const created = await prisma.storeCategoryType.create({
        data: { storeId, categoryId, name },
        select: { id: true },
      });
      savedId = created.id;
    }

    revalidatePath(TAXONOMY_PATH);

    return {
      success: true,
      id: savedId,
      message: id ? "Type updated successfully" : "Type added successfully",
    };
  } catch (error: any) {
    if (error?.code === "P2002") {
      return {
        success: false,
        message: "A type with this name already exists in this category",
        errors: {
          name: ["A type with this name already exists in this category"],
        },
      };
    }
    logger.error("upsertStoreCategoryType error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to save type") };
  }
}

export async function toggleStoreCategoryTypeActive(
  id: string,
  isActive: boolean,
): Promise<TaxonomyFormState> {
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

    const { count } = await prisma.storeCategoryType.updateMany({
      where: { id, storeId },
      data: { isActive },
    });

    if (count === 0) {
      return { success: false, message: "Type not found" };
    }

    revalidatePath(TAXONOMY_PATH);

    return {
      success: true,
      message: isActive ? "Type activated" : "Type deactivated",
    };
  } catch (error) {
    logger.error("toggleStoreCategoryTypeActive error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to update type") };
  }
}

export async function deleteStoreCategoryType(id: string): Promise<TaxonomyFormState> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return { success: false, message: "Only a Store Admin or Super Admin can delete a type." };
  }

  try {
    const storeId = await requireStoreScope();

    const type = await prisma.storeCategoryType.findFirst({
      where: { id, storeId },
      include: { _count: { select: { products: true } } },
    });

    if (!type) return { success: false, message: "Type not found" };

    if (type._count.products > 0) {
      return {
        success: false,
        message: `This type is used by ${type._count.products} product(s) and cannot be deleted. Disable it instead.`,
      };
    }

    await prisma.storeCategoryType.delete({ where: { id } });
    revalidatePath(TAXONOMY_PATH);

    return { success: true, message: "Type deleted" };
  } catch (error) {
    logger.error("deleteStoreCategoryType error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to delete type") };
  }
}

// ---------------------------------------------------------------------------
// Bulk import / export — Metals, Purities & Categories in one file, Stones &
// Stone Types in another. The template, its Instructions sheet and the
// export share one column definition (lib/inventory/taxonomy-sheet.ts), so
// an exported file imports back unchanged: a row whose name already exists
// updates that row, a new name is added, nothing is deleted. Same rules as
// the Settings forms (upsertStoreMetal / upsertStoreMetalPurity /
// upsertStoreMetalOrigin), checked across every sheet before anything is
// written; the writes then run in ONE transaction, so a file is imported
// whole or not at all. Selling-price changes are logged
// (recordSellingRateChange) inside that same transaction.
// ---------------------------------------------------------------------------

export type TaxonomyImportResult = {
  success: boolean;
  message: string;
  createdCount?: number;
  updatedCount?: number;
  errors?: string[];
};

function taxonomyImportCell(row: Record<string, unknown>, key: string): string {
  return String(row[key] ?? "").trim();
}

/** Blank → null; "6,800" / "₹ 6800" → 6800; anything else → NaN. */
function taxonomyImportNumber(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[₹,\s]/g, "").replace(/%$/, "");
  return cleaned === "" ? Number.NaN : Number(cleaned);
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;
const decimalOrNull = (value: { toString(): string } | null) => (value != null ? Number(value) : null);

/** Rows that have at least one non-blank cell (Excel often keeps empty rows). */
function nonEmptyRows(rows: Record<string, unknown>[] | undefined) {
  return (rows ?? []).filter((row) => Object.values(row).some((value) => String(value ?? "").trim() !== ""));
}

async function requireTaxonomyEditor(): Promise<TaxonomyImportResult | null> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
    return null;
  } catch {
    return { success: false, message: "Only the Store Owner can update these settings." };
  }
}

async function loadTaxonomyDropdowns(storeId: string) {
  const metals = await prisma.storeMetal.findMany({
    where: { storeId },
    select: { name: true, isGemstone: true, hasPurity: true },
    orderBy: { name: "asc" },
  });
  return {
    yesNo: ["Yes", "No"],
    units: [UNIT_LABELS.GRAM, UNIT_LABELS.CARAT],
    purityMetals: metals.filter((m) => !m.isGemstone && m.hasPurity).map((m) => m.name),
    stones: metals.filter((m) => m.isGemstone).map((m) => m.name),
  };
}

function metalFileWorkbook(
  rows: { metals: Record<string, unknown>[]; purities: Record<string, unknown>[]; categories: Record<string, unknown>[] },
  dropdowns: Awaited<ReturnType<typeof loadTaxonomyDropdowns>>,
  filePrefix: string,
) {
  return buildMultiSheetTemplate({
    sheets: [
      {
        name: METALS_SHEET.name,
        columns: sheetHeaders(METALS_SHEET),
        rows: rows.metals,
        dropdowns: { "Has Purity": dropdowns.yesNo, "Primary Unit": dropdowns.units },
      },
      {
        name: PURITIES_SHEET.name,
        columns: sheetHeaders(PURITIES_SHEET),
        rows: rows.purities,
        dropdowns: { Metal: dropdowns.purityMetals, Hallmarkable: dropdowns.yesNo },
      },
      { name: CATEGORIES_SHEET.name, columns: sheetHeaders(CATEGORIES_SHEET), rows: rows.categories },
    ],
    instructions: { notes: METAL_FILE_NOTES, rows: taxonomySheetInstructions(METAL_FILE_SHEETS) },
    filePrefix,
  });
}

function stoneFileWorkbook(
  rows: { stones: Record<string, unknown>[]; stoneTypes: Record<string, unknown>[] },
  dropdowns: Awaited<ReturnType<typeof loadTaxonomyDropdowns>>,
  filePrefix: string,
) {
  return buildMultiSheetTemplate({
    sheets: [
      {
        name: STONES_SHEET.name,
        columns: sheetHeaders(STONES_SHEET),
        rows: rows.stones,
        dropdowns: { "Primary Unit": dropdowns.units },
      },
      {
        name: STONE_TYPES_SHEET.name,
        columns: sheetHeaders(STONE_TYPES_SHEET),
        rows: rows.stoneTypes,
        dropdowns: { "Stone Name": dropdowns.stones },
      },
    ],
    instructions: { notes: STONE_FILE_NOTES, rows: taxonomySheetInstructions(STONE_FILE_SHEETS) },
    filePrefix,
  });
}

/**
 * A downloadable .xlsx with "Metals", "Purities" and "Categories" sheets
 * (example rows), an Instructions sheet and the store's dropdown lists.
 */
export async function getMetalCategoryImportTemplate(): Promise<{
  fileName: string;
  fileBase64: string;
}> {
  const storeId = await requireStoreScope();
  return metalFileWorkbook(
    { metals: METALS_SHEET.examples, purities: PURITIES_SHEET.examples, categories: CATEGORIES_SHEET.examples },
    await loadTaxonomyDropdowns(storeId),
    "metals-categories-import-template",
  );
}

/** A downloadable .xlsx with "Stones" and "Stone Types" sheets, as above. */
export async function getStoneTypeImportTemplate(): Promise<{
  fileName: string;
  fileBase64: string;
}> {
  const storeId = await requireStoreScope();
  return stoneFileWorkbook(
    { stones: STONES_SHEET.examples, stoneTypes: STONE_TYPES_SHEET.examples },
    await loadTaxonomyDropdowns(storeId),
    "stones-stone-types-import-template",
  );
}

export type TaxonomyExportResult = { success: boolean; message: string; fileName?: string; fileBase64?: string };

/** The store's Metals (with their Purities) and Categories, in the import template's layout. */
export async function exportMetalsAndCategoriesToExcel(): Promise<TaxonomyExportResult> {
  try {
    const storeId = await requireStoreScope();
    await assertPlanActiveForExport(storeId);

    const [metals, categories] = await Promise.all([
      prisma.storeMetal.findMany({
        where: { storeId, isGemstone: false },
        orderBy: { name: "asc" },
        include: { purities: { orderBy: [{ sortOrder: "asc" }, { label: "asc" }] } },
      }),
      prisma.storeCategory.findMany({
        where: { storeId },
        orderBy: { name: "asc" },
        include: { types: { orderBy: { name: "asc" }, select: { name: true } } },
      }),
    ]);

    const file = metalFileWorkbook(
      {
        metals: metals.map((metal) => ({
          Name: metal.name,
          "Has Purity": yesNo(metal.hasPurity),
          "Primary Unit": UNIT_LABELS[metal.primaryUnit],
        })),
        // A metal with Has Purity = No can't take purities on import, so
        // any stray rows under one stay out of the file.
        purities: metals
          .filter((metal) => metal.hasPurity)
          .flatMap((metal) =>
            metal.purities.map((purity) => ({
              Metal: metal.name,
              Label: purity.label,
              "SKU Code": purity.skuCode,
              "Fineness %": Number(purity.finenessPercent),
              "Selling Price": purity.sellingPrice != null ? Number(purity.sellingPrice) : "",
              Hallmarkable: yesNo(purity.isHallmarkable),
            })),
          ),
        categories: categories.map((category) => ({
          "Category Name": category.name,
          "Category Types": category.types.map((type) => type.name).join(", "),
        })),
      },
      await loadTaxonomyDropdowns(storeId),
      "metals-categories",
    );

    return { success: true, message: "Metals & categories exported.", ...file };
  } catch (error) {
    logger.error("exportMetalsAndCategoriesToExcel error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to export metals & categories.") };
  }
}

/** The store's Stones and Stone Types, in the import template's layout. */
export async function exportStonesAndStoneTypesToExcel(): Promise<TaxonomyExportResult> {
  try {
    const storeId = await requireStoreScope();
    await assertPlanActiveForExport(storeId);

    const stones = await prisma.storeMetal.findMany({
      where: { storeId, isGemstone: true },
      orderBy: { name: "asc" },
      include: { origins: { orderBy: { name: "asc" } } },
    });

    const file = stoneFileWorkbook(
      {
        stones: stones.map((stone) => ({ Name: stone.name, "Primary Unit": UNIT_LABELS[stone.primaryUnit] })),
        stoneTypes: stones.flatMap((stone) =>
          stone.origins.map((origin) => ({
            "Stone Name": stone.name,
            "Type Name": origin.name,
            "Selling Price": origin.sellingPrice != null ? Number(origin.sellingPrice) : "",
            "Grams per Carat": Number(origin.gramsPerCarat),
          })),
        ),
      },
      await loadTaxonomyDropdowns(storeId),
      "stones-stone-types",
    );

    return { success: true, message: "Stones & stone types exported.", ...file };
  } catch (error) {
    logger.error("exportStonesAndStoneTypesToExcel error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to export stones & stone types.") };
  }
}

/** A Selling Price cell on a Metal/Stone row — the column was retired. */
function retiredSellingPriceError(sheet: string, line: number, row: Record<string, unknown>, where: string) {
  return taxonomyImportCell(row, "Selling Price")
    ? `${sheet} Row ${line}: Selling Price is set per ${where} now — move it to the ${where === "Purity" ? "Purities" : "Stone Types"} sheet`
    : null;
}

async function readTaxonomyUpload(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  return parseExcelWorkbook(await file.arrayBuffer());
}

function importSummary(parts: { label: [string, string]; created: number; updated: number }[]) {
  const describe = (count: number, [one, many]: [string, string]) => `${count} ${count === 1 ? one : many}`;
  const added = parts.filter((p) => p.created).map((p) => describe(p.created, p.label));
  const updated = parts.filter((p) => p.updated).map((p) => describe(p.updated, p.label));
  const sentences = [];
  if (added.length) sentences.push(`Added ${added.join(", ")}.`);
  if (updated.length) sentences.push(`Updated ${updated.join(", ")}.`);
  return sentences.join(" ") || "Nothing to change.";
}

/**
 * Imports the Metals / Purities / Categories file. A Purity row's Metal may
 * be an existing metal or one on this file's Metals sheet.
 */
export async function importMetalsAndCategoriesFromExcel(
  formData: FormData,
): Promise<TaxonomyImportResult> {
  const roleError = await requireTaxonomyEditor();
  if (roleError) return roleError;

  try {
    const storeId = await requireStoreScope();
    const workbook = await readTaxonomyUpload(formData);
    if (!workbook) return { success: false, message: "Choose a .xlsx or .csv file to import." };

    const metalRows = nonEmptyRows(workbook[METALS_SHEET.name]);
    const purityRows = nonEmptyRows(workbook[PURITIES_SHEET.name]);
    const categoryRows = nonEmptyRows(workbook[CATEGORIES_SHEET.name]);

    if (!metalRows.length && !purityRows.length && !categoryRows.length) {
      return {
        success: false,
        message: "That file has no rows to import — check it has Metals, Purities and/or Categories sheets.",
      };
    }

    const [allMetals, existingCategories] = await Promise.all([
      prisma.storeMetal.findMany({
        where: { storeId },
        select: {
          id: true,
          name: true,
          isGemstone: true,
          hasPurity: true,
          primaryUnit: true,
          purities: {
            select: { id: true, label: true, skuCode: true, finenessPercent: true, sellingPrice: true, isHallmarkable: true },
          },
        },
      }),
      prisma.storeCategory.findMany({
        where: { storeId },
        select: { id: true, name: true, types: { select: { name: true } } },
      }),
    ]);

    // Metals and Stones share @@unique([storeId, name]) — one name space.
    const metalByName = new Map(allMetals.map((m) => [m.name.trim().toLowerCase(), m]));
    const categoryByName = new Map(existingCategories.map((c) => [c.name.trim().toLowerCase(), c]));

    const errors: string[] = [];

    type MetalPlan = { key: string; line: number; name: string; existingId: string | null; hasPurity: boolean; primaryUnit: WeightUnit };
    const metalPlans = new Map<string, MetalPlan>();

    for (const [index, row] of metalRows.entries()) {
      const line = index + 2;
      const name = taxonomyImportCell(row, "Name");
      const key = name.toLowerCase();

      if (!name) {
        errors.push(`Metals Row ${line}: Name is required`);
        continue;
      }
      const existing = metalByName.get(key);
      if (existing?.isGemstone) {
        errors.push(`Metals Row ${line}: "${name}" already exists under Stones — a metal can't have the same name as a stone`);
        continue;
      }
      if (metalPlans.has(key)) {
        errors.push(`Metals Row ${line}: "${name}" is duplicated in this sheet${earlierRowHint(metalPlans.get(key)!.line)}`);
        continue;
      }
      const retired = retiredSellingPriceError("Metals", line, row, "Purity");
      if (retired) {
        errors.push(retired);
        continue;
      }

      const hasPurityRaw = parseYesNo(taxonomyImportCell(row, "Has Purity"));
      if (hasPurityRaw === undefined) {
        errors.push(`Metals Row ${line}: Has Purity must be Yes or No`);
        continue;
      }
      const unitRaw = taxonomyImportCell(row, "Primary Unit");
      const unit = unitRaw ? parseUnitLabel(unitRaw) : null;
      if (unitRaw && !unit) {
        errors.push(`Metals Row ${line}: Primary Unit must be Gram or Carat`);
        continue;
      }

      metalPlans.set(key, {
        key,
        line,
        name: existing?.name ?? name,
        existingId: existing?.id ?? null,
        hasPurity: hasPurityRaw ?? existing?.hasPurity ?? true,
        primaryUnit: (unit ?? existing?.primaryUnit ?? WeightUnit.GRAM) as WeightUnit,
      });
    }

    type PurityPlan = {
      metalKey: string;
      metalName: string;
      existingId: string | null;
      before: number | null;
      label: string;
      skuCode: string;
      finenessPercent: number;
      sellingPrice: number | null;
      isHallmarkable: boolean;
    };
    const purityPlans: PurityPlan[] = [];
    const seenPurities = new Set<string>();

    for (const [index, row] of purityRows.entries()) {
      const line = index + 2;
      const metalName = taxonomyImportCell(row, "Metal");
      const label = taxonomyImportCell(row, "Label");
      const rowErrors: string[] = [];

      if (!metalName) rowErrors.push("Metal is required");
      if (!label) rowErrors.push("Label is required");
      else if (label.length > 40) rowErrors.push("Label must be 40 characters or fewer");
      if (rowErrors.length) {
        errors.push(`Purities Row ${line}: ${rowErrors.join("; ")}`);
        continue;
      }

      const metalKey = metalName.toLowerCase();
      const existingMetal = metalByName.get(metalKey);
      const planned = metalPlans.get(metalKey);
      if (!planned && !existingMetal) {
        errors.push(`Purities Row ${line}: No metal found named "${metalName}" (add it to the Metals sheet or check the spelling)`);
        continue;
      }
      if (!planned && existingMetal?.isGemstone) {
        errors.push(`Purities Row ${line}: "${metalName}" is a stone — stones have Stone Types, not purities`);
        continue;
      }
      const hasPurity = planned ? planned.hasPurity : existingMetal!.hasPurity;
      if (!hasPurity) {
        errors.push(`Purities Row ${line}: "${metalName}" has Has Purity = No — set it to Yes on the Metals sheet to give it purities`);
        continue;
      }

      const pairKey = `${metalKey}::${label.toLowerCase()}`;
      if (seenPurities.has(pairKey)) {
        errors.push(`Purities Row ${line}: "${label}" is duplicated for "${metalName}" in this sheet`);
        continue;
      }
      seenPurities.add(pairKey);

      // @@unique([storeMetalId, label]) is case-sensitive; match the saved
      // label ignoring case so "22k" updates "22K" instead of adding a twin.
      const existing = existingMetal?.purities.find((p) => p.label.trim().toLowerCase() === label.toLowerCase()) ?? null;

      const skuCode = taxonomyImportCell(row, "SKU Code") || existing?.skuCode || "";
      if (!skuCode) rowErrors.push("SKU Code is required");
      else if (skuCode.length > 20) rowErrors.push("SKU Code must be 20 characters or fewer");

      const fineness = taxonomyImportNumber(taxonomyImportCell(row, "Fineness %"));
      const finenessPercent =
        fineness ?? (existing ? Number(existing.finenessPercent) : defaultFinenessForLabel(planned?.name ?? existingMetal!.name, label));
      if (!Number.isFinite(finenessPercent) || finenessPercent <= 0 || finenessPercent > 100) {
        rowErrors.push("Fineness % must be more than 0 and up to 100");
      }

      const price = taxonomyImportNumber(taxonomyImportCell(row, "Selling Price"));
      if (price !== null && (!Number.isFinite(price) || price < 0)) rowErrors.push("Selling Price must be a number, 0 or more");

      const hallmarkable = parseYesNo(taxonomyImportCell(row, "Hallmarkable"));
      if (hallmarkable === undefined) rowErrors.push("Hallmarkable must be Yes or No");

      if (rowErrors.length) {
        errors.push(`Purities Row ${line}: ${rowErrors.join("; ")}`);
        continue;
      }

      const before = existing ? decimalOrNull(existing.sellingPrice) : null;
      purityPlans.push({
        metalKey,
        metalName,
        existingId: existing?.id ?? null,
        before,
        label: existing?.label ?? label,
        skuCode,
        finenessPercent,
        sellingPrice: price === null ? before : roundMoney(price),
        isHallmarkable: hallmarkable ?? existing?.isHallmarkable ?? false,
      });
    }

    type CategoryPlan = { name: string; existingId: string | null; newTypeNames: string[] };
    const categoryPlans: CategoryPlan[] = [];
    const seenCategoryNames = new Map<string, number>();

    for (const [index, row] of categoryRows.entries()) {
      const line = index + 2;
      const name = taxonomyImportCell(row, "Category Name");
      const key = name.toLowerCase();

      if (!name) {
        errors.push(`Categories Row ${line}: Category Name is required`);
        continue;
      }
      if (seenCategoryNames.has(key)) {
        errors.push(`Categories Row ${line}: "${name}" is duplicated in this sheet${earlierRowHint(seenCategoryNames.get(key)!)}`);
        continue;
      }
      seenCategoryNames.set(key, line);

      const existing = categoryByName.get(key);
      const existingTypes = new Set((existing?.types ?? []).map((t) => t.name.trim().toLowerCase()));
      const seenTypes = new Set<string>();
      const newTypeNames: string[] = [];
      for (const typeName of taxonomyImportCell(row, "Category Types").split(",").map((t) => t.trim()).filter(Boolean)) {
        const typeKey = typeName.toLowerCase();
        if (existingTypes.has(typeKey) || seenTypes.has(typeKey)) continue;
        seenTypes.add(typeKey);
        newTypeNames.push(typeName);
      }

      categoryPlans.push({ name: existing?.name ?? name, existingId: existing?.id ?? null, newTypeNames });
    }

    if (errors.length > 0) {
      return { success: false, message: "Nothing was imported. Fix these rows and try again.", errors };
    }

    const changedById = (await getCurrentUser())?.id ?? null;

    const counts = await prisma.$transaction(
      async (tx) => {
        const metalIdByKey = new Map(allMetals.map((m) => [m.name.trim().toLowerCase(), m.id]));
        let metalsCreated = 0;
        let metalsUpdated = 0;
        for (const plan of metalPlans.values()) {
          if (plan.existingId) {
            await tx.storeMetal.updateMany({
              where: { id: plan.existingId, storeId },
              data: { hasPurity: plan.hasPurity, primaryUnit: plan.primaryUnit },
            });
            metalsUpdated++;
          } else {
            const created = await tx.storeMetal.create({
              data: { storeId, name: plan.name, hasPurity: plan.hasPurity, isGemstone: false, primaryUnit: plan.primaryUnit },
              select: { id: true },
            });
            metalIdByKey.set(plan.key, created.id);
            metalsCreated++;
          }
        }

        let puritiesCreated = 0;
        let puritiesUpdated = 0;
        for (const plan of purityPlans) {
          const data = {
            label: plan.label,
            skuCode: plan.skuCode,
            finenessPercent: plan.finenessPercent,
            sellingPrice: plan.sellingPrice,
            isHallmarkable: plan.isHallmarkable,
          };
          let refId: string;
          if (plan.existingId) {
            await tx.storeMetalPurity.updateMany({ where: { id: plan.existingId, storeId }, data });
            refId = plan.existingId;
            puritiesUpdated++;
          } else {
            const created = await tx.storeMetalPurity.create({
              data: { storeId, storeMetalId: metalIdByKey.get(plan.metalKey)!, ...data },
              select: { id: true },
            });
            refId = created.id;
            puritiesCreated++;
          }
          await recordSellingRateChange(tx, {
            storeId,
            kind: "purity",
            refId,
            before: plan.before,
            after: plan.sellingPrice,
            changedById,
          });
        }

        let categoriesCreated = 0;
        let categoriesUpdated = 0;
        for (const plan of categoryPlans) {
          let categoryId = plan.existingId;
          if (categoryId) {
            if (plan.newTypeNames.length) categoriesUpdated++;
          } else {
            categoryId = (await tx.storeCategory.create({ data: { storeId, name: plan.name }, select: { id: true } })).id;
            categoriesCreated++;
          }
          if (plan.newTypeNames.length) {
            await tx.storeCategoryType.createMany({
              data: plan.newTypeNames.map((name) => ({ storeId, categoryId: categoryId!, name })),
            });
          }
        }

        return { metalsCreated, metalsUpdated, puritiesCreated, puritiesUpdated, categoriesCreated, categoriesUpdated };
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    revalidatePath(TAXONOMY_PATH);

    updateTag(sellingRatesTag(storeId));

    const createdCount = counts.metalsCreated + counts.puritiesCreated + counts.categoriesCreated;
    const updatedCount = counts.metalsUpdated + counts.puritiesUpdated + counts.categoriesUpdated;
    return {
      success: true,
      message: importSummary([
        { label: ["metal", "metals"], created: counts.metalsCreated, updated: counts.metalsUpdated },
        { label: ["purity", "purities"], created: counts.puritiesCreated, updated: counts.puritiesUpdated },
        { label: ["category", "categories"], created: counts.categoriesCreated, updated: counts.categoriesUpdated },
      ]),
      createdCount,
      updatedCount,
    };
  } catch (error) {
    logger.error("importMetalsAndCategoriesFromExcel error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to import metals/categories.") };
  }
}

/**
 * Imports the Stones / Stone Types file. A Stone Type row's Stone Name may
 * be an existing stone or one on this file's Stones sheet.
 */
export async function importStonesAndStoneTypesFromExcel(
  formData: FormData,
): Promise<TaxonomyImportResult> {
  const roleError = await requireTaxonomyEditor();
  if (roleError) return roleError;

  try {
    const storeId = await requireStoreScope();
    const workbook = await readTaxonomyUpload(formData);
    if (!workbook) return { success: false, message: "Choose a .xlsx or .csv file to import." };

    const stoneRows = nonEmptyRows(workbook[STONES_SHEET.name]);
    const stoneTypeRows = nonEmptyRows(workbook[STONE_TYPES_SHEET.name]);

    if (!stoneRows.length && !stoneTypeRows.length) {
      return { success: false, message: "That file has no rows to import — check it has Stones and/or Stone Types sheets." };
    }

    const allMetals = await prisma.storeMetal.findMany({
      where: { storeId },
      select: {
        id: true,
        name: true,
        isGemstone: true,
        primaryUnit: true,
        origins: { select: { id: true, name: true, sellingPrice: true, gramsPerCarat: true } },
      },
    });
    const metalByName = new Map(allMetals.map((m) => [m.name.trim().toLowerCase(), m]));

    const errors: string[] = [];

    type StonePlan = { key: string; line: number; name: string; existingId: string | null; primaryUnit: WeightUnit };
    const stonePlans = new Map<string, StonePlan>();

    for (const [index, row] of stoneRows.entries()) {
      const line = index + 2;
      const name = taxonomyImportCell(row, "Name");
      const key = name.toLowerCase();

      if (!name) {
        errors.push(`Stones Row ${line}: Name is required`);
        continue;
      }
      const existing = metalByName.get(key);
      if (existing && !existing.isGemstone) {
        errors.push(`Stones Row ${line}: "${name}" already exists under Metals — a stone can't have the same name as a metal`);
        continue;
      }
      if (stonePlans.has(key)) {
        errors.push(`Stones Row ${line}: "${name}" is duplicated in this sheet${earlierRowHint(stonePlans.get(key)!.line)}`);
        continue;
      }
      const retired = retiredSellingPriceError("Stones", line, row, "Stone Type");
      if (retired) {
        errors.push(retired);
        continue;
      }
      const unitRaw = taxonomyImportCell(row, "Primary Unit");
      const unit = unitRaw ? parseUnitLabel(unitRaw) : null;
      if (unitRaw && !unit) {
        errors.push(`Stones Row ${line}: Primary Unit must be Carat or Gram`);
        continue;
      }

      stonePlans.set(key, {
        key,
        line,
        name: existing?.name ?? name,
        existingId: existing?.id ?? null,
        primaryUnit: (unit ?? existing?.primaryUnit ?? WeightUnit.CARAT) as WeightUnit,
      });
    }

    type TypePlan = {
      stoneKey: string;
      existingId: string | null;
      before: number | null;
      name: string;
      sellingPrice: number | null;
      gramsPerCarat: number;
    };
    const typePlans: TypePlan[] = [];
    const seenPairs = new Map<string, number>();

    for (const [index, row] of stoneTypeRows.entries()) {
      const line = index + 2;
      const stoneName = taxonomyImportCell(row, "Stone Name");
      const typeName = taxonomyImportCell(row, "Type Name");
      const rowErrors: string[] = [];

      if (!stoneName) rowErrors.push("Stone Name is required");
      if (!typeName) rowErrors.push("Type Name is required");
      else if (typeName.length > 60) rowErrors.push("Type Name must be 60 characters or fewer");
      if (rowErrors.length) {
        errors.push(`Stone Types Row ${line}: ${rowErrors.join("; ")}`);
        continue;
      }

      const stoneKey = stoneName.toLowerCase();
      const existingStone = metalByName.get(stoneKey);
      if (!stonePlans.has(stoneKey) && !existingStone) {
        errors.push(
          `Stone Types Row ${line}: No stone found named "${stoneName}"${
            suggestFrom(stoneName, [
              ...namesAsCandidates(allMetals.filter((m) => m.isGemstone).map((m) => m.name)),
              ...[...stonePlans.values()].map((st) => ({ name: st.name, detail: "in this file's Stones sheet" })),
            ]) || " (add it to the Stones sheet or check the spelling)"
          }`,
        );
        continue;
      }
      if (!stonePlans.has(stoneKey) && existingStone && !existingStone.isGemstone) {
        errors.push(`Stone Types Row ${line}: "${stoneName}" is a metal — metals have Purities, not Stone Types`);
        continue;
      }

      const pairKey = `${stoneKey}::${typeName.toLowerCase()}`;
      if (seenPairs.has(pairKey)) {
        errors.push(`Stone Types Row ${line}: "${typeName}" is duplicated for "${stoneName}" in this sheet${earlierRowHint(seenPairs.get(pairKey)!)}`);
        continue;
      }
      seenPairs.set(pairKey, line);

      // @@unique([storeMetalId, name]) — match the saved name ignoring case.
      const existing = existingStone?.origins.find((o) => o.name.trim().toLowerCase() === typeName.toLowerCase()) ?? null;

      const price = taxonomyImportNumber(taxonomyImportCell(row, "Selling Price"));
      if (price !== null && (!Number.isFinite(price) || price < 0)) rowErrors.push("Selling Price must be a number, 0 or more");
      const grams = taxonomyImportNumber(taxonomyImportCell(row, "Grams per Carat"));
      const gramsPerCarat = grams ?? (existing ? Number(existing.gramsPerCarat) : 0.2);
      if (!Number.isFinite(gramsPerCarat) || gramsPerCarat <= 0) rowErrors.push("Grams per Carat must be a positive number");
      else if (gramsPerCarat >= 100) rowErrors.push("Grams per Carat must be less than 100");

      if (rowErrors.length) {
        errors.push(`Stone Types Row ${line}: ${rowErrors.join("; ")}`);
        continue;
      }

      const before = existing ? decimalOrNull(existing.sellingPrice) : null;
      typePlans.push({
        stoneKey,
        existingId: existing?.id ?? null,
        before,
        name: existing?.name ?? typeName,
        sellingPrice: price === null ? before : roundMoney(price),
        gramsPerCarat,
      });
    }

    if (errors.length > 0) {
      return { success: false, message: "Nothing was imported. Fix these rows and try again.", errors };
    }

    const changedById = (await getCurrentUser())?.id ?? null;

    const counts = await prisma.$transaction(
      async (tx) => {
        const stoneIdByKey = new Map(allMetals.map((m) => [m.name.trim().toLowerCase(), m.id]));
        let stonesCreated = 0;
        let stonesUpdated = 0;
        for (const plan of stonePlans.values()) {
          if (plan.existingId) {
            await tx.storeMetal.updateMany({ where: { id: plan.existingId, storeId }, data: { primaryUnit: plan.primaryUnit } });
            stonesUpdated++;
          } else {
            const created = await tx.storeMetal.create({
              data: { storeId, name: plan.name, hasPurity: false, isGemstone: true, primaryUnit: plan.primaryUnit },
              select: { id: true },
            });
            stoneIdByKey.set(plan.key, created.id);
            stonesCreated++;
          }
        }

        let typesCreated = 0;
        let typesUpdated = 0;
        for (const plan of typePlans) {
          const data = { name: plan.name, sellingPrice: plan.sellingPrice, gramsPerCarat: plan.gramsPerCarat };
          let refId: string;
          if (plan.existingId) {
            await tx.storeMetalOrigin.updateMany({ where: { id: plan.existingId, storeId }, data });
            refId = plan.existingId;
            typesUpdated++;
          } else {
            const created = await tx.storeMetalOrigin.create({
              data: { storeId, storeMetalId: stoneIdByKey.get(plan.stoneKey)!, ...data },
              select: { id: true },
            });
            refId = created.id;
            typesCreated++;
          }
          await recordSellingRateChange(tx, {
            storeId,
            kind: "stoneType",
            refId,
            before: plan.before,
            after: plan.sellingPrice,
            changedById,
          });
        }

        return { stonesCreated, stonesUpdated, typesCreated, typesUpdated };
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    revalidatePath(TAXONOMY_PATH);

    updateTag(sellingRatesTag(storeId));

    return {
      success: true,
      message: importSummary([
        { label: ["stone", "stones"], created: counts.stonesCreated, updated: counts.stonesUpdated },
        { label: ["stone type", "stone types"], created: counts.typesCreated, updated: counts.typesUpdated },
      ]),
      createdCount: counts.stonesCreated + counts.typesCreated,
      updatedCount: counts.stonesUpdated + counts.typesUpdated,
    };
  } catch (error) {
    logger.error("importStonesAndStoneTypesFromExcel error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to import stones/stone types.") };
  }
}


/**
 * Runs a purity / stone-type save and, in the same transaction, appends a
 * SellingRateEntry when its sellingPrice changed — so the rate history on
 * Metal Rates covers Settings edits as well as the top bar's rates chip.
 * `write` returns the saved id, or null when the row wasn't found.
 */
async function saveWithRateHistory(
  storeId: string,
  kind: Extract<SellingRateKind, "purity" | "stoneType">,
  id: string,
  write: (tx: Prisma.TransactionClient) => Promise<string | null>,
  sellingPrice: number | null,
): Promise<string | null> {
  const changedById = (await getCurrentUser())?.id ?? null;

  return prisma.$transaction(async (tx) => {
    let before: number | null = null;
    if (id) {
      const row =
        kind === "purity"
          ? await tx.storeMetalPurity.findFirst({ where: { id, storeId }, select: { sellingPrice: true } })
          : await tx.storeMetalOrigin.findFirst({ where: { id, storeId }, select: { sellingPrice: true } });
      before = row?.sellingPrice != null ? Number(row.sellingPrice) : null;
    }

    const savedId = await write(tx);
    if (!savedId) return null;

    const after = sellingPrice === null ? null : Math.round(sellingPrice * 100) / 100;
    await recordSellingRateChange(tx, { storeId, kind, refId: savedId, before, after, changedById });
    return savedId;
  });
}
