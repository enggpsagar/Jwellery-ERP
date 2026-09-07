import type { Metadata } from "next";

import { ProductCreateForm } from "@/components/inventory/products/product-create-form";
import { ResetFormWrapper } from "@/components/shared/reset-form-wrapper";
import {
  getStoreCategories,
  getStoreMetals,
  getAllStoreMetalOrigins,
} from "@/lib/actions/taxonomy-actions";
import { getCaratConversionRateMap } from "@/lib/actions/purity-actions";
import { getBusinessSettings } from "@/lib/actions/settings-actions";
import {
  getDefaultLocationId,
  getStoreLocations,
} from "@/lib/actions/store-location-actions";
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

  const [metals, categories, caratConversionRates, origins, locations, defaultLocationId, businessSettings] =
    await Promise.all([
      getStoreMetals(),
      getStoreCategories(),
      getCaratConversionRateMap(),
      getAllStoreMetalOrigins(),
      getStoreLocations(),
      getDefaultLocationId(),
      getBusinessSettings(),
    ]);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <ResetFormWrapper
        header={{
          title: "Add Product",
          description: "Create a new jewellery product master.",
          backHref: returnTo ?? "/inventory/products",
          backLabel: returnTo ? "Back without saving" : "Back to Products",
        }}
      >
        <ProductCreateForm
          metals={metals}
          categories={categories}
          caratConversionRates={caratConversionRates}
          origins={origins}
          locations={locations}
          defaultLocationId={defaultLocationId ?? undefined}
          returnTo={returnTo}
          skuFormat={businessSettings.skuFormat}
        />
      </ResetFormWrapper>
    </main>
  );
}
