import type { Metadata } from "next";

import { getProducts } from "@/lib/actions/inventory/product-actions";
import { hasPermission } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { ArchivedProductsClient } from "@/components/inventory/products/archived-products-client";

export const metadata: Metadata = {
  title: "Archived Products",
};

type ArchivedProductsPageProps = {
  searchParams?: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function ArchivedProductsPage({
  searchParams,
}: ArchivedProductsPageProps) {
  const params = (await searchParams) ?? {};

  const page = Number(params.page || 1);
  const pageSize = Number(params.pageSize || 10);
  const search = params.search || "";

  const [canEdit, { products, pagination }] = await Promise.all([
    hasPermission(PERMISSIONS.PRODUCT_UPDATE),
    getProducts({
      page,
      pageSize,
      search,
      sortBy: "name",
      sortOrder: "asc",
      status: "INACTIVE",
    }),
  ]);

  return (
    <ArchivedProductsClient
      products={products}
      pagination={pagination}
      canEdit={canEdit}
    />
  );
}
