import type { Metadata } from "next";

import { getProducts, type ProductSortBy } from "@/lib/actions/inventory/product-actions";
import { hasPermission } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/permissions";

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
  const [{ products, pagination }, canCreate, canEdit] = await Promise.all([
    getProducts({ page, pageSize, search, sortBy, sortOrder }),
    hasPermission(PERMISSIONS.PRODUCT_CREATE),
    hasPermission(PERMISSIONS.PRODUCT_UPDATE),
  ]);

  return (
    <ProductsClient
      products={products}
      pagination={pagination}
      canCreate={canCreate}
      canEdit={canEdit}
    />
  );
}
