// FILE PATH: lib/actions/branding-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { BrandFontFamily, BrandRadius, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getStoreIdForRead, requireStoreScope } from "@/lib/store-context";
import { requireRole } from "@/lib/auth/auth";
import { actionErrorMessage } from "@/lib/action-error";
import { logger } from "@/lib/logger";
import { BRAND_ACTION_KEYS, BRAND_STATUS_KEYS } from "@/lib/branding";

export type StoreBrandingSettings = {
  storeId: string;
  accentColor: string | null;
  backgroundColor: string | null;
  cardColor: string | null;
  foregroundColor: string | null;
  sidebarColor: string | null;
  headerColor: string | null;
  editColor: string | null;
  deleteColor: string | null;
  cancelColor: string | null;
  exportColor: string | null;
  importColor: string | null;
  statusDraftColor: string | null;
  statusPendingColor: string | null;
  statusCompletedColor: string | null;
  statusActiveColor: string | null;
  statusInactiveColor: string | null;
  showIcons: boolean;
  fontFamily: BrandFontFamily;
  radius: BrandRadius;
};

export type BrandingFormState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
};

// Every color field this form can submit, in one place so update/reset stay
// in sync with StoreBrandingSettings above without repeating the list three
// times over.
const COLOR_FIELDS = [
  "accentColor",
  "backgroundColor",
  "cardColor",
  "foregroundColor",
  "sidebarColor",
  "headerColor",
  ...BRAND_ACTION_KEYS,
  ...BRAND_STATUS_KEYS,
] as const;
type ColorField = (typeof COLOR_FIELDS)[number];

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
    sidebarColor: branding.sidebarColor,
    headerColor: branding.headerColor,
    editColor: branding.editColor,
    deleteColor: branding.deleteColor,
    cancelColor: branding.cancelColor,
    exportColor: branding.exportColor,
    importColor: branding.importColor,
    statusDraftColor: branding.statusDraftColor,
    statusPendingColor: branding.statusPendingColor,
    statusCompletedColor: branding.statusCompletedColor,
    statusActiveColor: branding.statusActiveColor,
    statusInactiveColor: branding.statusInactiveColor,
    showIcons: branding.showIcons,
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
    const colors = {} as Record<ColorField, string | null>;
    for (const field of COLOR_FIELDS) {
      colors[field] = parseOptionalColor(formData.get(field), field, errors);
    }

    const fontFamilyRaw = String(formData.get("fontFamily") || "INTER");
    const fontFamily = Object.values(BrandFontFamily).includes(fontFamilyRaw as BrandFontFamily)
      ? (fontFamilyRaw as BrandFontFamily)
      : BrandFontFamily.INTER;

    const radiusRaw = String(formData.get("radius") || "DEFAULT");
    const radius = Object.values(BrandRadius).includes(radiusRaw as BrandRadius)
      ? (radiusRaw as BrandRadius)
      : BrandRadius.DEFAULT;

    const showIcons = String(formData.get("showIcons") || "true") !== "false";

    if (Object.keys(errors).length > 0) {
      return { success: false, message: "Fix the highlighted fields", errors };
    }

    const data = { ...colors, fontFamily, radius, showIcons };

    await prisma.storeBranding.upsert({
      where: { storeId },
      create: { storeId, ...data },
      update: data,
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

    const clearedColors = Object.fromEntries(
      COLOR_FIELDS.map((field) => [field, null]),
    ) as Record<ColorField, null>;

    await prisma.storeBranding.upsert({
      where: { storeId },
      create: { storeId },
      update: {
        ...clearedColors,
        fontFamily: BrandFontFamily.INTER,
        radius: BrandRadius.DEFAULT,
        showIcons: true,
      },
    });

    revalidatePath("/", "layout");

    return { success: true, message: "Branding reset to defaults" };
  } catch (error) {
    logger.error("resetStoreBranding error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to reset branding") };
  }
}
