// lib/actions/settings-actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { UserRole, GstScheme, SkuFormat, PrintLayout, InvoiceTemplate } from "@prisma/client";
import { requireStoreScope } from "@/lib/store-context";
import { requireRole } from "@/lib/auth/auth";
import { MONEY_UNIT } from "@/lib/business-units";
import { getAvailableBusinessUnitOptions } from "@/lib/business-units.server";
import { LEGACY_PLACEHOLDER_BUSINESS_NAME } from "@/lib/constants/app";
import { logger } from "@/lib/logger";

export type BusinessSettings = {
  storeId: string;
  businessName: string;
  legalName: string;
  logoUrl: string;
  gstNumber: string;
  panNumber: string;
  cin: string;
  stateCode: string;
  gstScheme: GstScheme;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  website: string;
  backupEmail: string;
  invoicePrefix: string;
  invoiceStartingNo: number;
  invoiceTerms: string;
  invoiceNotes: string;
  // Which physical format the Invoice print page renders in (A4 or a
  // narrow Thermal receipt) — see PrintLayout's own schema doc comment.
  printLayout: PrintLayout;
  // Which of the four A4 templates (Classic/Modern/Minimal/Elegant) the
  // Invoice/Kacha Slip/Quotation print pages render in when printLayout is
  // A4 — see InvoiceTemplate's own schema doc comment.
  invoiceTemplate: InvoiceTemplate;
  // Bank account the store gets paid into — printed as the invoice's "Pay
  // To" block, shown only once bankName is set.
  bankName: string;
  bankAccountNumber: string;
  bankIfscCode: string;
  bankAccountHolderName: string;
  defaultGstRate: number;
  // BIS hallmarking fee, per hallmarked piece — see the schema field's own
  // doc comment (BusinessSettings.hallmarkChargePerPiece) for why the
  // default is a placeholder that needs store confirmation, not a
  // guaranteed-current government rate.
  hallmarkChargePerPiece: number;
  // Whether the return window policy is switched on at all — see
  // prisma/schema.prisma's BusinessSettings.returnWindowEnabled doc comment.
  // Every consumer of returnWindowDays below must also check this.
  returnWindowEnabled: boolean;
  // Which SKU layout preset createProduct's generator arranges Metal/
  // Purity/Style/Category into — see prisma/schema.prisma's SkuFormat and
  // lib/inventory/product-sku.ts's composeSkuPrefix(). Edited via its own
  // small SkuFormatForm/updateSkuFormat, not the big updateBusinessSettings
  // form below.
  skuFormat: SkuFormat;
  // How many days after invoiceDate a sold item may still be returned via a
  // Credit Note — see prisma/schema.prisma's BusinessSettings.returnWindowDays
  // doc comment and lib/return-window.ts's getReturnEligibility(). Only
  // enforced when returnWindowEnabled is true.
  returnWindowDays: number;
  financialYearStartMonth: number;
  // Each entry is "MONEY" or a live StoreMetal.id — see
  // lib/business-units.server.ts's BusinessUnitOption for the resolved
  // {value, label, isGemstone} shape pickers should actually render from.
  businessUnits: string[];
};

export type SettingsFormState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
};

function toOptionalString(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str || null;
}

function toNumber(value: FormDataEntryValue | null, fallback: number) {
  if (value === null || value === "") return fallback;
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
}

function mapSettings(settings: any): BusinessSettings {
  return {
    storeId: settings.storeId,
    businessName: settings.businessName ?? "",
    legalName: settings.legalName ?? "",
    logoUrl: settings.logoUrl ?? "",
    gstNumber: settings.gstNumber ?? "",
    panNumber: settings.panNumber ?? "",
    cin: settings.cin ?? "",
    stateCode: settings.stateCode ?? "",
    gstScheme: settings.gstScheme ?? GstScheme.REGULAR_B2C,
    address: settings.address ?? "",
    city: settings.city ?? "",
    state: settings.state ?? "",
    pincode: settings.pincode ?? "",
    phone: settings.phone ?? "",
    email: settings.email ?? "",
    website: settings.website ?? "",
    backupEmail: settings.backupEmail ?? "",
    invoicePrefix: settings.invoicePrefix ?? "INV",
    invoiceStartingNo: settings.invoiceStartingNo ?? 1,
    invoiceTerms: settings.invoiceTerms ?? "",
    invoiceNotes: settings.invoiceNotes ?? "",
    printLayout: settings.printLayout ?? PrintLayout.A4,
    invoiceTemplate: settings.invoiceTemplate ?? InvoiceTemplate.CLASSIC,
    bankName: settings.bankName ?? "",
    bankAccountNumber: settings.bankAccountNumber ?? "",
    bankIfscCode: settings.bankIfscCode ?? "",
    bankAccountHolderName: settings.bankAccountHolderName ?? "",
    defaultGstRate: Number(settings.defaultGstRate ?? 3.0),
    hallmarkChargePerPiece: Number(settings.hallmarkChargePerPiece ?? 45),
    returnWindowEnabled: settings.returnWindowEnabled ?? true,
    skuFormat: settings.skuFormat ?? SkuFormat.METAL_PURITY_STYLE_CATEGORY,
    returnWindowDays: settings.returnWindowDays ?? 30,
    financialYearStartMonth: settings.financialYearStartMonth ?? 4,
    businessUnits: settings.businessUnits?.length
      ? settings.businessUnits
      : [MONEY_UNIT],
  };
}

/**
 * Only accepts values that are actually selectable right now (MONEY or one
 * of the store's currently active StoreMetal ids) — a stale value from a
 * cached form (e.g. a metal deactivated/deleted after the page loaded) is
 * dropped rather than saved, same "don't persist a dangling reference"
 * spirit as getActiveBusinessUnits' own resolution.
 */
async function parseBusinessUnits(formData: FormData): Promise<string[]> {
  const options = await getAvailableBusinessUnitOptions();
  const validValues = new Set(options.map((option) => option.value));

  const selected = formData
    .getAll("businessUnits")
    .map((value) => String(value))
    .filter((value) => validValues.has(value));

  return selected.length ? selected : [MONEY_UNIT];
}

/**
 * Fetch the single business settings record, creating a default
 * one on first access so the form always has something to render.
 */
export async function getBusinessSettings(): Promise<BusinessSettings> {
  const storeId = await requireStoreScope();

  let settings = await prisma.businessSettings.findUnique({
    where: { storeId },
  });

  if (!settings) {
    // Seed the trading name from the store's own name rather than a generic
    // placeholder. This row is created the first time anyone opens Settings,
    // and whatever lands in `businessName` is what every invoice and email
    // then calls the business — a placeholder here meant real stores sent
    // mail signed "My Jewellery Store".
    //
    // City/state also carry over from here: registration required both
    // (the store code is derived from them, see store-registration-actions.ts)
    // and stored them on Store.city/Store.state — without this, that same
    // owner would land on a blank Settings page and have to type the exact
    // same city/state right back in.
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true, city: true, state: true },
    });

    settings = await prisma.businessSettings.create({
      data: {
        storeId,
        businessName: store?.name?.trim() || LEGACY_PLACEHOLDER_BUSINESS_NAME,
        city: store?.city ?? null,
        state: store?.state ?? null,
      },
    });
  }

  return mapSettings(settings);
}

export async function updateBusinessSettings(
  prevState: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return {
      success: false,
      message: "Only the Store Owner can update these settings.",
    };
  }

  try {
    const businessName = String(formData.get("businessName") || "").trim();

    if (!businessName) {
      return {
        success: false,
        message: "Business name is required",
        errors: { businessName: ["Business name is required"] },
      };
    }

    const gstNumber = toOptionalString(formData.get("gstNumber"));
    if (gstNumber && !/^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]{3}$/.test(gstNumber)) {
      return {
        success: false,
        message: "Invalid GSTIN format",
        errors: { gstNumber: ["Enter a valid 15-character GSTIN"] },
      };
    }

    // A malformed backup address would only surface later, at the moment a
    // destructive operation tries to send its backup and refuses to proceed.
    const backupEmail = toOptionalString(formData.get("backupEmail"));
    if (backupEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(backupEmail)) {
      return {
        success: false,
        message: "Invalid backup email address",
        errors: { backupEmail: ["Enter a valid email address"] },
      };
    }

    const gstSchemeRaw = String(formData.get("gstScheme") || GstScheme.REGULAR_B2C);
    if (!Object.values(GstScheme).includes(gstSchemeRaw as GstScheme)) {
      return {
        success: false,
        message: "Invalid GST scheme",
        errors: { gstScheme: ["Select a valid GST scheme"] },
      };
    }
    const gstScheme = gstSchemeRaw as GstScheme;

    const printLayoutRaw = String(formData.get("printLayout") || PrintLayout.A4);
    if (!Object.values(PrintLayout).includes(printLayoutRaw as PrintLayout)) {
      return {
        success: false,
        message: "Invalid print layout",
        errors: { printLayout: ["Select a valid print layout"] },
      };
    }
    const printLayout = printLayoutRaw as PrintLayout;

    const invoiceTemplateRaw = String(formData.get("invoiceTemplate") || InvoiceTemplate.CLASSIC);
    if (!Object.values(InvoiceTemplate).includes(invoiceTemplateRaw as InvoiceTemplate)) {
      return {
        success: false,
        message: "Invalid invoice template",
        errors: { invoiceTemplate: ["Select a valid invoice template"] },
      };
    }
    const invoiceTemplate = invoiceTemplateRaw as InvoiceTemplate;

    const storeId = await requireStoreScope();
    const businessUnits = await parseBusinessUnits(formData);

    await prisma.businessSettings.upsert({
      where: { storeId },
      update: {
        businessName,
        legalName: toOptionalString(formData.get("legalName")),
        gstNumber,
        gstScheme,
        panNumber: toOptionalString(formData.get("panNumber")),
        cin: toOptionalString(formData.get("cin")),
        stateCode: toOptionalString(formData.get("stateCode")),
        address: toOptionalString(formData.get("address")),
        city: toOptionalString(formData.get("city")),
        state: toOptionalString(formData.get("state")),
        pincode: toOptionalString(formData.get("pincode")),
        phone: toOptionalString(formData.get("phone")),
        email: toOptionalString(formData.get("email")),
        website: toOptionalString(formData.get("website")),
        backupEmail: toOptionalString(formData.get("backupEmail")),
        invoicePrefix: String(formData.get("invoicePrefix") || "INV").trim(),
        invoiceStartingNo: toNumber(formData.get("invoiceStartingNo"), 1),
        invoiceTerms: toOptionalString(formData.get("invoiceTerms")),
        invoiceNotes: toOptionalString(formData.get("invoiceNotes")),
        printLayout,
        invoiceTemplate,
        bankName: toOptionalString(formData.get("bankName")),
        bankAccountNumber: toOptionalString(formData.get("bankAccountNumber")),
        bankIfscCode: toOptionalString(formData.get("bankIfscCode")),
        bankAccountHolderName: toOptionalString(formData.get("bankAccountHolderName")),
        defaultGstRate: toNumber(formData.get("defaultGstRate"), 3.0),
        hallmarkChargePerPiece: toNumber(
          formData.get("hallmarkChargePerPiece"),
          45,
        ),
        returnWindowEnabled: formData.get("returnWindowEnabled") === "on",
        returnWindowDays: toNumber(formData.get("returnWindowDays"), 30),
        financialYearStartMonth: toNumber(
          formData.get("financialYearStartMonth"),
          4,
        ),
        businessUnits,
      },
      create: {
        storeId,
        businessName,
        legalName: toOptionalString(formData.get("legalName")),
        gstNumber,
        gstScheme,
        panNumber: toOptionalString(formData.get("panNumber")),
        cin: toOptionalString(formData.get("cin")),
        stateCode: toOptionalString(formData.get("stateCode")),
        address: toOptionalString(formData.get("address")),
        city: toOptionalString(formData.get("city")),
        state: toOptionalString(formData.get("state")),
        pincode: toOptionalString(formData.get("pincode")),
        phone: toOptionalString(formData.get("phone")),
        email: toOptionalString(formData.get("email")),
        website: toOptionalString(formData.get("website")),
        backupEmail: toOptionalString(formData.get("backupEmail")),
        invoicePrefix: String(formData.get("invoicePrefix") || "INV").trim(),
        invoiceStartingNo: toNumber(formData.get("invoiceStartingNo"), 1),
        invoiceTerms: toOptionalString(formData.get("invoiceTerms")),
        invoiceNotes: toOptionalString(formData.get("invoiceNotes")),
        printLayout,
        invoiceTemplate,
        bankName: toOptionalString(formData.get("bankName")),
        bankAccountNumber: toOptionalString(formData.get("bankAccountNumber")),
        bankIfscCode: toOptionalString(formData.get("bankIfscCode")),
        bankAccountHolderName: toOptionalString(formData.get("bankAccountHolderName")),
        defaultGstRate: toNumber(formData.get("defaultGstRate"), 3.0),
        hallmarkChargePerPiece: toNumber(
          formData.get("hallmarkChargePerPiece"),
          45,
        ),
        returnWindowEnabled: formData.get("returnWindowEnabled") === "on",
        returnWindowDays: toNumber(formData.get("returnWindowDays"), 30),
        financialYearStartMonth: toNumber(
          formData.get("financialYearStartMonth"),
          4,
        ),
        businessUnits,
      },
    });

    revalidatePath("/settings");
    revalidatePath("/ledger");
    revalidatePath("/customers");
    revalidatePath("/billing/new");
    revalidatePath("/billing/kacha/new");
    revalidatePath("/quotations/new");
    revalidatePath("/purchases/new");

    return { success: true, message: "Settings updated successfully" };
  } catch (error) {
    logger.error("updateBusinessSettings error", error);
    return { success: false, message: "Failed to update settings" };
  }
}

export async function removeStoreLogo(): Promise<SettingsFormState> {
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

    await prisma.businessSettings.updateMany({
      where: { storeId },
      data: { logoUrl: null },
    });

    revalidatePath("/settings");
    revalidatePath("/dashboard");

    return { success: true, message: "Logo removed" };
  } catch (error) {
    logger.error("removeStoreLogo error", error);
    return { success: false, message: "Failed to remove logo" };
  }
}

/**
 * Sets the store's SKU layout preset — its own small action (mirrors
 * updateCaratConversionRates/updateMetalSellingRates) rather than folded
 * into the big updateBusinessSettings form, since it's a single choice with
 * its own dedicated Settings widget. Only affects products created AFTER
 * this save; existing productCode values are never touched (see SkuFormat's
 * own doc comment).
 */
export async function updateSkuFormat(
  prevState: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return {
      success: false,
      message: "Only the Store Owner can update these settings.",
    };
  }

  try {
    const skuFormatRaw = String(formData.get("skuFormat") || "");
    if (!Object.values(SkuFormat).includes(skuFormatRaw as SkuFormat)) {
      return { success: false, message: "Select a valid SKU format" };
    }

    const storeId = await requireStoreScope();

    // getBusinessSettings() (always called before this form renders) has
    // already created the row on first access — a plain update is safe.
    await prisma.businessSettings.update({
      where: { storeId },
      data: { skuFormat: skuFormatRaw as SkuFormat },
    });

    revalidatePath("/settings");
    revalidatePath("/inventory/products/new");

    return { success: true, message: "SKU format updated" };
  } catch (error) {
    logger.error("updateSkuFormat error", error);
    return { success: false, message: "Failed to update SKU format" };
  }
}