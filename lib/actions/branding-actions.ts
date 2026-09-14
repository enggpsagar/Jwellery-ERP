// FILE PATH: lib/actions/branding-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { BrandFontFamily, BrandRadius, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getStoreIdForRead, requireStoreScope } from "@/lib/store-context";
import { requireRole } from "@/lib/auth/auth";
import { actionErrorMessage } from "@/lib/action-error";
import { logger } from "@/lib/logger";

export type StoreBrandingSettings = {
  storeId: string;
  accentColor: string | null;
  backgroundColor: string | null;
  cardColor: string | null;
  foregroundColor: string | null;
  fontFamily: BrandFontFamily;
  radius: BrandRadius;
};

export type BrandingFormState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
};

// #rgb, #rrggbb, or empty/omitted (cleared back to the app default).
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function parseOptionalColor(
  value: FormDataEntryValue | null,
  field: string,
  errors: Record<string, string[]>,
): string | null {
  const str = String(value ?? "").trim();
  if (!str) return null;

  if (!HEX_COLOR_RE.test(str)) {
    errors[field] = [`Enter a valid hex color (e.g. #C4901F).`];
    return null;
  }

  return str;
}

async function requireBrandingEditor(): Promise<BrandingFormState | null> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
    return null;
  } catch {
    return { success: false, message: "Only the Store Owner can update branding." };
  }
}

/**
 * Read-only, called from the (dashboard) layout (every page, via a Client
 * Component boundary isn't needed here — the layout itself is a Server
 * Component) — getStoreIdForRead(), not requireStoreScope(), so this never
 * trips the plan-expiry gate for what is just a page render.
 *
 * Lazily creates the row on first read, same convention as
 * getBusinessSettings() — a store that's never opened Branding gets back
 * every field at its "use the app default" value (null colors, INTER,
 * DEFAULT radius) rather than a missing row the caller has to special-case.
 */
export async function getStoreBranding(): Promise<StoreBrandingSettings> {
  const storeId = await getStoreIdForRead();

  let branding = await prisma.storeBranding.findUnique({ where: { storeId } });

  if (!branding) {
    branding = await prisma.storeBranding.create({ data: { storeId } });
  }

  return {
    storeId: branding.storeId,
    accentColor: branding.accentColor,
    backgroundColor: branding.backgroundColor,
    cardColor: branding.cardColor,
    foregroundColor: branding.foregroundColor,
    fontFamily: branding.fontFamily,
    radius: branding.radius,
  };
}

export async function updateStoreBranding(
  prevState: BrandingFormState,
  formData: FormData,
): Promise<BrandingFormState> {
  const roleError = await requireBrandingEditor();
  if (roleError) return roleError;

  try {
    const storeId = await requireStoreScope();

    const errors: Record<string, string[]> = {};
    const accentColor = parseOptionalColor(formData.get("accentColor"), "accentColor", errors);
    const backgroundColor = parseOptionalColor(formData.get("backgroundColor"), "backgroundColor", errors);
    const cardColor = parseOptionalColor(formData.get("cardColor"), "cardColor", errors);
    const foregroundColor = parseOptionalColor(formData.get("foregroundColor"), "foregroundColor", errors);

    const fontFamilyRaw = String(formData.get("fontFamily") || "INTER");
    const fontFamily = Object.values(BrandFontFamily).includes(fontFamilyRaw as BrandFontFamily)
      ? (fontFamilyRaw as BrandFontFamily)
      : BrandFontFamily.INTER;

    const radiusRaw = String(formData.get("radius") || "DEFAULT");
    const radius = Object.values(BrandRadius).includes(radiusRaw as BrandRadius)
      ? (radiusRaw as BrandRadius)
      : BrandRadius.DEFAULT;

    if (Object.keys(errors).length > 0) {
      return { success: false, message: "Fix the highlighted fields", errors };
    }

    await prisma.storeBranding.upsert({
      where: { storeId },
      create: { storeId, accentColor, backgroundColor, cardColor, foregroundColor, fontFamily, radius },
      update: { accentColor, backgroundColor, cardColor, foregroundColor, fontFamily, radius },
    });

    // Every page in the dashboard reads branding in its shared layout, so a
    // single revalidatePath("/", "layout") style sweep is what actually
    // makes it visible without a manual refresh — revalidating just
    // /brand-guide would leave every other open page showing the old theme.
    revalidatePath("/", "layout");

    return { success: true, message: "Branding updated" };
  } catch (error) {
    logger.error("updateStoreBranding error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to update branding") };
  }
}

export async function resetStoreBranding(): Promise<BrandingFormState> {
  const roleError = await requireBrandingEditor();
  if (roleError) return roleError;

  try {
    const storeId = await requireStoreScope();

    await prisma.storeBranding.upsert({
      where: { storeId },
      create: { storeId },
      update: {
        accentColor: null,
        backgroundColor: null,
        cardColor: null,
        foregroundColor: null,
        fontFamily: BrandFontFamily.INTER,
        radius: BrandRadius.DEFAULT,
      },
    });

    revalidatePath("/", "layout");

    return { success: true, message: "Branding reset to defaults" };
  } catch (error) {
    logger.error("resetStoreBranding error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to reset branding") };
  }
}
