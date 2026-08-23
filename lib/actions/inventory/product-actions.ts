"use server";

import { revalidatePath } from "next/cache";
import { PurityType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireStoreScope } from "@/lib/store-context";
import type { ProductFormState } from "@/lib/inventory/product-types";

function parseNullableString(value: FormDataEntryValue | null) {
  const parsed = String(value || "").trim();
  return parsed.length ? parsed : null;
}

function parseOptionalEnum<T extends string>(
  value: FormDataEntryValue | null,
  allowed: readonly T[],
): T | null {
  const parsed = String(value || "").trim();
  if (!parsed) return null;
  return allowed.includes(parsed as T) ? (parsed as T) : null;
}

function parseNullableDecimal(
  value: FormDataEntryValue | null
): number | null {
  const parsed = String(value ?? "").trim();

  if (!parsed) {
    return null;
  }

  const number = Number(parsed);

  return Number.isNaN(number) ? null : number;
}

function parseBoolean(value: FormDataEntryValue | null) {
  return String(value || "") === "true";
}

/**
 * Convert Prisma product row into plain JSON-safe object
 * so it can be passed from Server Component to Client Component.
 */
function serializeProduct(product: {
  id: string;
  productCode: string;
  name: string;
  categoryId: string | null;
  categoryTypeId: string | null;
  metalTypeId: string | null;
  category: { id: string; name: string } | null;
  categoryType: { id: string; name: string } | null;
  metalType: { id: string; name: string } | null;
  defaultPurity: PurityType | null;
  defaultMakingCharge: { toString(): string } | null;
  defaultStoneCharge: { toString(): string } | null;
  designCode: string | null;
  hsnCode: string | null;
  description: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: product.id,
    productCode: product.productCode,
    name: product.name,
    categoryId: product.categoryId,
    categoryTypeId: product.categoryTypeId,
    metalTypeId: product.metalTypeId,
    category: product.category,
    categoryType: product.categoryType,
    metalType: product.metalType,
    defaultPurity: product.defaultPurity,
    defaultMakingCharge: product.defaultMakingCharge?.toString() ?? null,
    defaultStoneCharge: product.defaultStoneCharge?.toString() ?? null,
    designCode: product.designCode,
    hsnCode: product.hsnCode,
    description: product.description,
    notes: product.notes,
    isActive: product.isActive,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

const PRODUCT_RELATIONS = {
  category: { select: { id: true, name: true } },
  categoryType: { select: { id: true, name: true } },
  metalType: { select: { id: true, name: true } },
} as const;

export async function getProducts() {
  const storeId = await requireStoreScope();

  const rows = await prisma.product.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    include: PRODUCT_RELATIONS,
  });

  return rows.map((row) => ({
    id: row.id,
    productCode: row.productCode,
    name: row.name,
    category: row.category?.name ?? "-",
    ornamentType: row.categoryType?.name ?? null,
    metalType: row.metalType?.name ?? "-",
    defaultPurity: row.defaultPurity,
    defaultMakingCharge:
      row.defaultMakingCharge != null ? Number(row.defaultMakingCharge) : null,
    defaultStoneCharge:
      row.defaultStoneCharge != null ? Number(row.defaultStoneCharge) : null,
    designCode: row.designCode,
    hsnCode: row.hsnCode,
    description: row.description,
    notes: row.notes,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function getProductById(id: string) {
  const storeId = await requireStoreScope();

  const product = await prisma.product.findFirst({
    where: { id, storeId },
    include: PRODUCT_RELATIONS,
  });

  if (!product) return null;
  return serializeProduct(product);
}

/**
 * Validate that categoryId / metalTypeId / (optional) categoryTypeId
 * reference real, store-scoped rows. Returns field errors for anything
 * that doesn't resolve.
 */
async function validateTaxonomySelection(
  storeId: string,
  categoryId: string,
  metalTypeId: string,
  categoryTypeId: string | null,
): Promise<Record<string, string[]>> {
  const errors: Record<string, string[]> = {};

  const [categoryRow, metalRow, typeRow] = await Promise.all([
    categoryId
      ? prisma.storeCategory.findFirst({
          where: { id: categoryId, storeId },
          select: { id: true },
        })
      : Promise.resolve(null),
    metalTypeId
      ? prisma.storeMetal.findFirst({
          where: { id: metalTypeId, storeId },
          select: { id: true },
        })
      : Promise.resolve(null),
    categoryTypeId
      ? prisma.storeCategoryType.findFirst({
          where: { id: categoryTypeId, storeId, categoryId: categoryId || undefined },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  if (!categoryId) {
    errors.categoryId = ["Category is required"];
  } else if (!categoryRow) {
    errors.categoryId = ["Selected category is invalid"];
  }

  if (!metalTypeId) {
    errors.metalTypeId = ["Metal type is required"];
  } else if (!metalRow) {
    errors.metalTypeId = ["Selected metal type is invalid"];
  }

  if (categoryTypeId && !typeRow) {
    errors.categoryTypeId = ["Selected type is invalid for this category"];
  }

  return errors;
}

export async function createProduct(
  prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  try {
    const productCode = String(formData.get("productCode") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();

    const categoryId = String(formData.get("categoryId") ?? "").trim();
    const categoryTypeId = parseNullableString(formData.get("categoryTypeId"));
    const metalTypeId = String(formData.get("metalTypeId") ?? "").trim();

    const defaultPurity = parseOptionalEnum(
      formData.get("defaultPurity"),
      Object.values(PurityType),
    ) as PurityType | null;

    const defaultMakingCharge = parseNullableDecimal(
      formData.get("defaultMakingCharge"),
    );

    const defaultStoneCharge = parseNullableDecimal(
      formData.get("defaultStoneCharge"),
    );

    const designCode = parseNullableString(formData.get("designCode"));
    const hsnCode = parseNullableString(formData.get("hsnCode"));
    const description = parseNullableString(formData.get("description"));
    const notes = parseNullableString(formData.get("notes"));
    const isActive = parseBoolean(formData.get("isActive"));

    const errors: Record<string, string[]> = {};

    if (!productCode) {
      errors.productCode = ["Product code is required"];
    }

    if (!name) {
      errors.name = ["Product name is required"];
    }

    const storeId = await requireStoreScope();

    Object.assign(
      errors,
      await validateTaxonomySelection(
        storeId,
        categoryId,
        metalTypeId,
        categoryTypeId,
      ),
    );

    if (Object.keys(errors).length > 0) {
      return {
        success: false,
        message: "Please fix the form errors.",
        errors,
      };
    }

    const existing = await prisma.product.findFirst({
      where: { productCode, storeId },
      select: { id: true },
    });

    if (existing) {
      return {
        success: false,
        message: "Product code already exists.",
        errors: {
          productCode: ["This product code is already in use."],
        },
      };
    }

    await prisma.product.create({
      data: {
        storeId,
        productCode,
        name,
        categoryId,
        categoryTypeId,
        metalTypeId,
        defaultPurity,
        defaultMakingCharge,
        defaultStoneCharge,
        designCode,
        hsnCode,
        description,
        notes,
        isActive,
      },
    });

    revalidatePath("/inventory");
    revalidatePath("/inventory/products");

    return {
      success: true,
      message: "Product created successfully.",
      errors: {},
    };
  } catch (error) {
    console.error("createProduct error:", error);

    return {
      success: false,
      message: "Failed to create product.",
      errors: {},
    };
  }
}

export async function updateProduct(
  id: string,
  prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  try {
    const productCode = String(formData.get("productCode") || "").trim();
    const name = String(formData.get("name") || "").trim();

    const categoryId = String(formData.get("categoryId") ?? "").trim();
    const categoryTypeId = parseNullableString(formData.get("categoryTypeId"));
    const metalTypeId = String(formData.get("metalTypeId") ?? "").trim();

    const defaultPurity = parseOptionalEnum(
      formData.get("defaultPurity"),
      Object.values(PurityType),
    ) as PurityType | null;
    const defaultMakingCharge = parseNullableDecimal(
      formData.get("defaultMakingCharge"),
    );

    const defaultStoneCharge = parseNullableDecimal(
      formData.get("defaultStoneCharge"),
    );
    const designCode = parseNullableString(formData.get("designCode"));
    const hsnCode = parseNullableString(formData.get("hsnCode"));
    const description = parseNullableString(formData.get("description"));
    const notes = parseNullableString(formData.get("notes"));
    const isActive = parseBoolean(formData.get("isActive"));

    const errors: Record<string, string[]> = {};

    if (!productCode) {
      errors.productCode = ["Product code is required"];
    }

    if (!name) {
      errors.name = ["Product name is required"];
    }

    const storeId = await requireStoreScope();

    Object.assign(
      errors,
      await validateTaxonomySelection(
        storeId,
        categoryId,
        metalTypeId,
        categoryTypeId,
      ),
    );

    if (Object.keys(errors).length > 0) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors,
      };
    }

    const existing = await prisma.product.findFirst({
      where: {
        productCode,
        storeId,
        NOT: { id },
      },
      select: { id: true },
    });

    if (existing) {
      return {
        success: false,
        message: "Product code already exists",
        errors: {
          productCode: ["This product code is already in use"],
        },
      };
    }

   const { count } = await prisma.product.updateMany({
  where: { id, storeId },
  data: {
    productCode,
    name,
    categoryId,
    categoryTypeId,
    metalTypeId,
    defaultPurity,
    defaultMakingCharge,
    defaultStoneCharge,
    designCode,
    hsnCode,
    description,
    notes,
    isActive,
  },
})

    if (count === 0) {
      return {
        success: false,
        message: "Product not found",
        errors: {},
      };
    }

    revalidatePath("/inventory");
    revalidatePath("/inventory/products");
    revalidatePath(`/inventory/products/${id}`);
    revalidatePath(`/inventory/products/${id}/edit`);

    return {
      success: true,
      message: "Product updated successfully",
      errors: {},
    };
  } catch (error) {
    console.error("updateProduct error:", error);
    return {
      success: false,
      message: "Failed to update product",
      errors: {},
    };
  }
}

/**
 * Delete product only when:
 * 1) No stock rows exist for this product
 * 2) Therefore no invoice / karigar downstream dependency should remain
 */
export async function deleteProduct(id: string): Promise<ProductFormState> {
  try {
    const storeId = await requireStoreScope();

    const product = await prisma.product.findFirst({
      where: { id, storeId },
      select: {
        id: true,
        name: true,
        stockItems: {
          select: {
            id: true,
            stockCode: true,
            quantity: true,
            invoiceItems: {
              select: { id: true },
              take: 1,
            },
            karigarJobs: {
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });

    if (!product) {
      return {
        success: false,
        message: "Product not found",
        errors: {},
      };
    }

    if (product.stockItems.length > 0) {
      const stockLinkedToInvoices = product.stockItems.some(
        (stock) => stock.invoiceItems.length > 0,
      );

      const stockLinkedToKarigarJobs = product.stockItems.some(
        (stock) => stock.karigarJobs.length > 0,
      );

      if (stockLinkedToInvoices || stockLinkedToKarigarJobs) {
        return {
          success: false,
          message:
            "This product cannot be deleted because inventory or transaction records are linked to it. Please first remove all stock entries for this product. If any stock is already used in sales or karigar jobs, remove those dependent records first.",
          errors: {},
        };
      }

      return {
        success: false,
        message:
          "This product cannot be deleted because inventory exists for it. Please first clear / remove all stock entries for this product, then try again.",
        errors: {},
      };
    }

    await prisma.product.delete({
      where: { id },
    });

    revalidatePath("/inventory");
    revalidatePath("/inventory/products");

    return {
      success: true,
      message: "Product deleted successfully",
      errors: {},
    };
  } catch (error) {
    console.error("deleteProduct error:", error);
    return {
      success: false,
      message: "Failed to delete product",
      errors: {},
    };
  }
}
