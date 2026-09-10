// lib/actions/gst-rate-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireStoreScope } from "@/lib/store-context";
import { requireRole } from "@/lib/auth/auth";
import { logger } from "@/lib/logger";

export type GstRateRow = {
  id: string;
  name: string;
  ratePercent: number;
  isActive: boolean;
  isDefault: boolean;
};

export type GstRateFormState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
};

const GST_RATES_PATH = "/settings/gst-rates";

export async function getGstRates(): Promise<GstRateRow[]> {
  const storeId = await requireStoreScope();

  const rates = await prisma.gstRate.findMany({
    where: { storeId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  return rates.map((rate) => ({
    id: rate.id,
    name: rate.name,
    ratePercent: Number(rate.ratePercent),
    isActive: rate.isActive,
    isDefault: rate.isDefault,
  }));
}

export async function upsertGstRate(
  prevState: GstRateFormState,
  formData: FormData,
): Promise<GstRateFormState> {
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
    const ratePercentRaw = String(formData.get("ratePercent") || "").trim();

    const errors: Record<string, string[]> = {};

    if (!name) {
      errors.name = ["Rate name is required"];
    }

    const ratePercent = Number(ratePercentRaw);
    if (!ratePercentRaw || Number.isNaN(ratePercent) || ratePercent < 0 || ratePercent > 100) {
      errors.ratePercent = ["Enter a valid rate between 0 and 100"];
    }

    if (Object.keys(errors).length > 0) {
      return { success: false, message: "Please fix the form errors", errors };
    }

    const storeId = await requireStoreScope();

    const existing = await prisma.gstRate.findFirst({
      where: { storeId, name, NOT: id ? { id } : undefined },
      select: { id: true },
    });

    if (existing) {
      return {
        success: false,
        message: "A GST rate with this name already exists",
        errors: { name: ["A GST rate with this name already exists"] },
      };
    }

    if (id) {
      const { count } = await prisma.gstRate.updateMany({
        where: { id, storeId },
        data: { name, ratePercent },
      });

      if (count === 0) {
        return { success: false, message: "GST rate not found" };
      }
    } else {
      await prisma.gstRate.create({
        data: { storeId, name, ratePercent },
      });
    }

    revalidatePath(GST_RATES_PATH);

    return {
      success: true,
      message: id ? "GST rate updated successfully" : "GST rate added successfully",
    };
  } catch (error: any) {
    if (error?.code === "P2002") {
      return {
        success: false,
        message: "A GST rate with this name already exists",
        errors: { name: ["A GST rate with this name already exists"] },
      };
    }
    logger.error("upsertGstRate error", error);
    return { success: false, message: "Failed to save GST rate" };
  }
}

export async function setGstRateActive(
  id: string,
  isActive: boolean,
): Promise<GstRateFormState> {
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

    const data: { isActive: boolean; isDefault?: boolean } = { isActive };
    // Deactivating the current default clears its default flag too, rather
    // than blocking the deactivation outright — leaves the store with no
    // default rate until an active one is explicitly picked again, same as
    // "no rate configured yet" is already handled everywhere a default is
    // read (fall back to the first active rate).
    if (!isActive) {
      data.isDefault = false;
    }

    const { count } = await prisma.gstRate.updateMany({
      where: { id, storeId },
      data,
    });

    if (count === 0) {
      return { success: false, message: "GST rate not found" };
    }

    revalidatePath(GST_RATES_PATH);

    return {
      success: true,
      message: isActive ? "GST rate activated" : "GST rate deactivated",
    };
  } catch (error) {
    logger.error("setGstRateActive error", error);
    return { success: false, message: "Failed to update GST rate" };
  }
}

export type GstRateSnapshot = {
  gstRateId: string;
  gstRateName: string;
  gstRatePercent: number;
};

/** Resolves a client-submitted gstRateId into the trio actually persisted
 * onto an Invoice/Purchase/Quotation as a snapshot — never trust a
 * client-submitted name/percent, always re-read the store's own current
 * row. Returns null (not an error) for a missing/invalid/foreign id, so a
 * Composition-scheme document (which never selects a rate) or old client
 * code mid-deploy just saves the three fields as null rather than failing
 * the whole save — see GstRate's own doc comment in schema.prisma. Takes
 * `storeId` explicitly rather than re-resolving it via requireStoreScope,
 * since some callers (e.g. the QR scan-to-sell path) may act on a
 * different store than the current session's active one. */
export async function resolveGstRateSnapshot(
  storeId: string,
  gstRateId: string | null | undefined,
): Promise<GstRateSnapshot | null> {
  if (!gstRateId) return null;

  const rate = await prisma.gstRate.findFirst({
    where: { id: gstRateId, storeId },
    select: { id: true, name: true, ratePercent: true },
  });

  if (!rate) return null;

  return {
    gstRateId: rate.id,
    gstRateName: rate.name,
    gstRatePercent: Number(rate.ratePercent),
  };
}

export async function setDefaultGstRate(id: string): Promise<GstRateFormState> {
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

    const rate = await prisma.gstRate.findFirst({
      where: { id, storeId },
      select: { id: true, isActive: true },
    });

    if (!rate) {
      return { success: false, message: "GST rate not found" };
    }

    // At most one isDefault=true per store — no DB constraint for this
    // (see the schema doc comment on GstRate), enforced here by clearing
    // every other row for the store in the same transaction as setting
    // this one.
    await prisma.$transaction([
      prisma.gstRate.updateMany({
        where: { storeId, NOT: { id } },
        data: { isDefault: false },
      }),
      prisma.gstRate.update({
        where: { id },
        data: { isDefault: true, isActive: true },
      }),
    ]);

    revalidatePath(GST_RATES_PATH);

    return { success: true, message: "Default GST rate updated" };
  } catch (error) {
    logger.error("setDefaultGstRate error", error);
    return { success: false, message: "Failed to update default GST rate" };
  }
}
