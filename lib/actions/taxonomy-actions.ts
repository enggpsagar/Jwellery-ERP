"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireStoreScope } from "@/lib/store-context";
import { requireRole } from "@/lib/auth/auth";

export type StoreMetalRow = {
  id: string;
  name: string;
  hasPurity: boolean;
  isActive: boolean;
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

    if (!name) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors: { name: ["Metal name is required"] },
      };
    }

    const storeId = await requireStoreScope();

    const existing = await prisma.storeMetal.findFirst({
      where: { storeId, name, NOT: id ? { id } : undefined },
      select: { id: true },
    });

    if (existing) {
      return {
        success: false,
        message: "A metal with this name already exists",
        errors: { name: ["A metal with this name already exists"] },
      };
    }

    if (id) {
      const { count } = await prisma.storeMetal.updateMany({
        where: { id, storeId },
        data: { name, hasPurity },
      });

      if (count === 0) {
        return { success: false, message: "Metal not found" };
      }
    } else {
      await prisma.storeMetal.create({
        data: { storeId, name, hasPurity },
      });
    }

    revalidatePath(TAXONOMY_PATH);

    return {
      success: true,
      message: id ? "Metal updated successfully" : "Metal added successfully",
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
