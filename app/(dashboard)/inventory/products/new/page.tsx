import type { Metadata } from "next";

import { ProductCreateForm } from "@/components/inventory/products/product-create-form";
import { PageBackHeader } from "@/components/shared/page-back-header";
import {
  getStoreCategories,
  getStoreMetals,
  getAllStoreMetalOrigins,
} from "@/lib/actions/taxonomy-actions";
import { getCaratConversionRateMap } from "@/lib/actions/purity-actions";
import { safeReturnTo } from "@/lib/safe-return-to";

export const metadata: Metadata = {
  title: "Add Product",
};

type NewProductPageProps = {
  searchParams?: Promise<{ returnTo?: string }>;
};

export default async function NewProductPage({
  searchParams,
}: NewProductPageProps) {
  const params = (await searchParams) ?? {};
  const returnTo = safeReturnTo(params.returnTo);

  const [metals, categories, caratConversionRates, origins] = await Promise.all([
    getStoreMetals(),
    getStoreCategories(),
    getCaratConversionRateMap(),
    getAllStoreMetalOrigins(),
  ]);

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Add Product"
        description="Create a new jewellery product master."
        backHref={returnTo ?? "/inventory/products"}
        backLabel={returnTo ? "Back without saving" : "Back to Products"}
      />

      <ProductCreateForm
        metals={metals}
        categories={categories}
        caratConversionRates={caratConversionRates}
        origins={origins}
        returnTo={returnTo}
      />
    </main>
  );
}
