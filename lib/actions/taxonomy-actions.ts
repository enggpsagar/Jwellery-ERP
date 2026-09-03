"use server";

import { revalidatePath } from "next/cache";
import { UserRole, StoneOrigin } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireStoreScope } from "@/lib/store-context";
import { requireRole } from "@/lib/auth/auth";

export type StoreMetalRow = {
  id: string;
  name: string;
  hasPurity: boolean;
  isActive: boolean;
  // isGemstone: false -> a Metals-section row. true -> a Stones-section row
  // (see TaxonomySettingsForm, which splits this same list by the flag).
  // stoneOrigin is only ever set when isGemstone is true.
  isGemstone: boolean;
  stoneOrigin: StoneOrigin | null;
};

export type StoreCategoryRow = {
  id: string;
  name: string;
  isActive: boolean;
};

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
};

const TAXONOMY_PATH = "/settings/taxonomy";

// ---------------------------------------------------------------------------
// Store Metals
// ---------------------------------------------------------------------------

export async function getStoreMetals(): Promise<StoreMetalRow[]> {
  const storeId = await requireStoreScope();

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
    stoneOrigin: metal.stoneOrigin,
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
    const stoneOriginRaw = String(formData.get("stoneOrigin") || "").trim();
    const stoneOrigin = isGemstone
      ? stoneOriginRaw === "NATURAL" || stoneOriginRaw === "LAB_GROWN"
        ? (stoneOriginRaw as StoneOrigin)
        : null
      : null; // a plain metal never carries an origin, regardless of what was posted

    const errors: Record<string, string[]> = {};
    if (!name) errors.name = ["Name is required"];
    if (isGemstone && !stoneOrigin) {
      errors.stoneOrigin = ["Select Natural or Lab-Grown"];
    }

    if (Object.keys(errors).length > 0) {
      return { success: false, message: "Please fix the form errors", errors };
    }

    const storeId = await requireStoreScope();

    const existing = await prisma.storeMetal.findFirst({
      where: { storeId, name, NOT: id ? { id } : undefined },
      select: { id: true },
    });

    if (existing) {
      const message = isGemstone
        ? "A stone with this name already exists"
        : "A metal with this name already exists";
      return { success: false, message, errors: { name: [message] } };
    }

    if (id) {
      const { count } = await prisma.storeMetal.updateMany({
        where: { id, storeId },
        data: { name, hasPurity, isGemstone, stoneOrigin },
      });

      if (count === 0) {
        return { success: false, message: isGemstone ? "Stone not found" : "Metal not found" };
      }
    } else {
      await prisma.storeMetal.create({
        data: { storeId, name, hasPurity, isGemstone, stoneOrigin },
      });
    }

    revalidatePath(TAXONOMY_PATH);

    return {
      success: true,
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
    console.error("upsertStoreMetal error:", error);
    return { success: false, message: "Failed to save metal" };
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

    return {
      success: true,
      message: isActive ? "Metal activated" : "Metal deactivated",
    };
  } catch (error) {
    console.error("toggleStoreMetalActive error:", error);
    return { success: false, message: "Failed to update metal" };
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
      },
    });

    if (!metal) return { success: false, message: "Metal type not found" };

    const usageCount = Object.values(metal._count).reduce((sum, n) => sum + n, 0);
    if (usageCount > 0) {
      return {
        success: false,
        message: `This metal type is used by ${usageCount} existing record(s) and cannot be deleted. Disable it instead.`,
      };
    }

    await prisma.storeMetal.delete({ where: { id } });
    revalidatePath(TAXONOMY_PATH);

    return { success: true, message: "Metal type deleted" };
  } catch (error) {
    console.error("deleteStoreMetal error:", error);
    return { success: false, message: "Failed to delete metal type" };
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
  });

  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    isActive: category.isActive,
  }));
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

    if (id) {
      const { count } = await prisma.storeCategory.updateMany({
        where: { id, storeId },
        data: { name },
      });

      if (count === 0) {
        return { success: false, message: "Category not found" };
      }
    } else {
      await prisma.storeCategory.create({
        data: { storeId, name },
      });
    }

    revalidatePath(TAXONOMY_PATH);

    return {
      success: true,
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
    console.error("upsertStoreCategory error:", error);
    return { success: false, message: "Failed to save category" };
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
    console.error("toggleStoreCategoryActive error:", error);
    return { success: false, message: "Failed to update category" };
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
    console.error("deleteStoreCategory error:", error);
    return { success: false, message: "Failed to delete category" };
  }
}

// ---------------------------------------------------------------------------
// Store Category Types (cascading under a Category)
// ---------------------------------------------------------------------------

export async function getStoreCategoryTypes(
  categoryId: string,
): Promise<StoreCategoryTypeRow[]> {
  const storeId = await requireStoreScope();

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

    if (id) {
      const { count } = await prisma.storeCategoryType.updateMany({
        where: { id, storeId },
        data: { name, categoryId },
      });

      if (count === 0) {
        return { success: false, message: "Type not found" };
      }
    } else {
      await prisma.storeCategoryType.create({
        data: { storeId, categoryId, name },
      });
    }

    revalidatePath(TAXONOMY_PATH);

    return {
      success: true,
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
    console.error("upsertStoreCategoryType error:", error);
    return { success: false, message: "Failed to save type" };
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
    console.error("toggleStoreCategoryTypeActive error:", error);
    return { success: false, message: "Failed to update type" };
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
    console.error("deleteStoreCategoryType error:", error);
    return { success: false, message: "Failed to delete type" };
  }
}
