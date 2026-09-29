import type { Metadata } from "next";

import {
  getProducts,
  type ProductSortBy,
} from "@/lib/actions/inventory/product-actions";
import { hasPermission } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { getCategoryFilterOptions, getStoreMetals } from "@/lib/actions/taxonomy-actions";
import { UNASSIGNED_METAL_TYPE } from "@/lib/business-units";

import { ProductsClient } from "@/components/inventory/products/products-client";

export const metadata: Metadata = {
  title: "Products",
};

type InventoryProductsPageProps = {
  searchParams?: Promise<{
    page?: string
    pageSize?: string
    search?: string
    sortBy?: ProductSortBy
    sortOrder?: "asc" | "desc"
    type?: string
    status?: string
    dateFrom?: string
    dateTo?: string
    category?: string
    categoryType?: string
    stoneType?: string
  }>
}

export const dynamic = "force-dynamic";

export default async function InventoryProductsPage({
  searchParams,
}: InventoryProductsPageProps) {
  const params = (await searchParams) ?? {};

  const page = Number(params.page || 1);
  const pageSize = Number(params.pageSize || 10);
  const search = params.search || "";
  const sortBy = params.sortBy || "createdAt";
  const sortOrder = params.sortOrder || "desc";

  // Resolved here rather than in the client component: session permissions
  // are on the JWT, and a client-side check would be advisory only. The
  // create/edit routes enforce the same permissions themselves.
  const [canCreate, canEdit, metals, categoryFilter] = await Promise.all([
    hasPermission(PERMISSIONS.PRODUCT_CREATE),
    hasPermission(PERMISSIONS.PRODUCT_UPDATE),
    getStoreMetals(),
    getCategoryFilterOptions(),
  ]);

  const validMetalTypeIds = new Set([...metals.map((m) => m.id), UNASSIGNED_METAL_TYPE]);
  const metalTypeId = params.type && validMetalTypeIds.has(params.type) ? params.type : undefined;

  // Archived (Inactive) products have their own dedicated page — defaulting
  // this one to Active-only (rather than showing every status when the
  // filter is untouched) keeps an archived product from still turning up
  // here too. Picking "Inactive" from the filter still works as an
  // explicit override for anyone who wants to check from this page anyway.
  const status = params.status === "INACTIVE" ? "INACTIVE" : "ACTIVE";
  const dateFrom = params.dateFrom || undefined;
  const dateTo = params.dateTo || undefined;
  // Same validation as the Stock page — own active ids only, and a Type
  // only when it belongs to the selected Category.
  // ...and, like the toolbar, only a Category offered for the chosen Metal
  // (untagged = every metal).
  const categoryId = categoryFilter.categories.some(
    (c) =>
      c.value === params.category &&
      (!metalTypeId || c.metalTagIds.length === 0 || c.metalTagIds.includes(metalTypeId)),
  )
    ? params.category
    : undefined;
  const categoryTypeId =
    categoryId &&
    categoryFilter.categoryTypes.some((t) => t.value === params.categoryType && t.categoryId === categoryId)
      ? params.categoryType
      : undefined;
  // A stone (Diamond ...) filters by its own Stone Type instead of Category
  // — only a Stone Type that belongs to the selected stone counts.
  const stoneOriginOptionId =
    metalTypeId &&
    categoryFilter.stoneTypes.some((t) => t.value === params.stoneType && t.metalId === metalTypeId)
      ? params.stoneType
      : undefined;

  const { products, pagination, totals } = await getProducts({
    page,
    pageSize,
    search,
    sortBy,
    sortOrder,
    metalTypeId,
    status,
    dateFrom,
    dateTo,
    categoryId,
    categoryTypeId,
    stoneOriginOptionId,
  });

  return (
    <ProductsClient
      products={products}
      pagination={pagination}
      totals={totals}
      canCreate={canCreate}
      canEdit={canEdit}
      metals={metals}
      categoryFilter={categoryFilter}
    />
  );
}
