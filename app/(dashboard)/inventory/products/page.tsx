import { getProducts } from "@/lib/actions/inventory/product-actions";

import { ProductsClient } from "@/components/inventory/products/products-client";

type InventoryProductsPageProps = {
  searchParams?: Promise<{
    page?: string
    pageSize?: string
    search?: string
    sortBy?: "name" | "productCode" | "createdAt"
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

  const { products, pagination } = await getProducts({
    page,
    pageSize,
    search,
    sortBy,
    sortOrder,
  });

  return <ProductsClient products={products} pagination={pagination} />;
}
