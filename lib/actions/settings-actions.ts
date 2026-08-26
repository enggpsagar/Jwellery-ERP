// lib/actions/settings-actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { UserRole, BusinessUnit } from "@prisma/client";
import { requireStoreScope } from "@/lib/store-context";
import { requireRole } from "@/lib/auth/auth";
import { ALL_BUSINESS_UNITS } from "@/lib/business-units";

export type BusinessSettings = {
  storeId: string;
  businessName: string;
  legalName: string;
  logoUrl: string;
  gstNumber: string;
  panNumber: string;
  stateCode: string;
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
  defaultGstRate: number;
  financialYearStartMonth: number;
  businessUnits: BusinessUnit[];
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
    stateCode: settings.stateCode ?? "",
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
    defaultGstRate: Number(settings.defaultGstRate ?? 3.0),
    financialYearStartMonth: settings.financialYearStartMonth ?? 4,
    businessUnits: settings.businessUnits?.length
      ? settings.businessUnits
      : [BusinessUnit.MONEY],
  };
}

function parseBusinessUnits(formData: FormData): BusinessUnit[] {
  const selected = formData
    .getAll("businessUnits")
    .map((value) => String(value))
    .filter((value): value is BusinessUnit =>
      ALL_BUSINESS_UNITS.includes(value as BusinessUnit),
    );

  return selected.length ? selected : [BusinessUnit.MONEY];
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
    settings = await prisma.businessSettings.create({
      data: {
        storeId,
        businessName: "My Jewellery Store",
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

    const storeId = await requireStoreScope();
    const businessUnits = parseBusinessUnits(formData);

    await prisma.businessSettings.upsert({
      where: { storeId },
      update: {
        businessName,
        legalName: toOptionalString(formData.get("legalName")),
        gstNumber,
        panNumber: toOptionalString(formData.get("panNumber")),
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
        defaultGstRate: toNumber(formData.get("defaultGstRate"), 3.0),
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
        panNumber: toOptionalString(formData.get("panNumber")),
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
        defaultGstRate: toNumber(formData.get("defaultGstRate"), 3.0),
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

    return { success: true, message: "Settings updated successfully" };
  } catch (error) {
    console.error("updateBusinessSettings error:", error);
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
    console.error("removeStoreLogo error:", error);
    return { success: false, message: "Failed to remove logo" };
  }
}