import type { Metadata } from "next";

import { ProductCreateForm } from "@/components/inventory/products/product-create-form";
import { ResetFormWrapper } from "@/components/shared/reset-form-wrapper";
import {
  getStoreCategories,
  getStoreMetals,
  getStoreStyles,
  getStoreStoneClarities,
  getAllStoreMetalOrigins,
} from "@/lib/actions/taxonomy-actions";
import { getCaratConversionRateMap } from "@/lib/actions/purity-actions";
import { getBusinessSettings } from "@/lib/actions/settings-actions";
import { getGstRates } from "@/lib/actions/gst-rate-actions";
import {
  getDefaultLocationId,
  getStoreLocations,
} from "@/lib/actions/store-location-actions";
import { safeReturnTo } from "@/lib/safe-return-to";
import { getProductById } from "@/lib/actions/inventory/product-actions";

export const metadata: Metadata = {
  title: "Add Product",
};

type NewProductPageProps = {
  searchParams?: Promise<{ returnTo?: string; fromProductId?: string }>;
};

export default async function NewProductPage({
  searchParams,
}: NewProductPageProps) {
  const params = (await searchParams) ?? {};
  const returnTo = safeReturnTo(params.returnTo);

  const [metals, categories, styles, caratConversionRates, origins, locations, defaultLocationId, businessSettings, gstRates, clarities, fromProduct] =
    await Promise.all([
      getStoreMetals(),
      getStoreCategories(),
      getStoreStyles(),
      getCaratConversionRateMap(),
      getAllStoreMetalOrigins(),
      getStoreLocations(),
      getDefaultLocationId(),
      getBusinessSettings(),
      getGstRates(),
      getStoreStoneClarities(),
      // "Create new product" from a locked product's edit page: start from a
      // copy of it (store-scoped read; an unknown id just starts blank).
      params.fromProductId ? getProductById(params.fromProductId) : Promise.resolve(null),
    ]);
  const initialProduct = fromProduct
    ? { ...fromProduct, id: undefined, identityLocked: false }
    : undefined;

  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl space-y-6 p-6">
      <ResetFormWrapper
        header={{
          title: "Add Product",
          description: fromProduct
            ? `Starting from a copy of ${fromProduct.name} — change what's different, then save it as a new product.`
            : "Create a new jewellery product master.",
          backHref: returnTo ?? "/inventory/products",
          backLabel: returnTo ? "Back without saving" : "Back to Products",
        }}
      >
        <ProductCreateForm
          metals={metals}
          categories={categories}
          styles={styles}
          clarities={clarities}
          caratConversionRates={caratConversionRates}
          origins={origins}
          locations={locations}
          defaultLocationId={defaultLocationId ?? undefined}
          returnTo={returnTo}
          styleFieldEnabled={businessSettings.styleFieldEnabled}
          gstRates={gstRates}
          initialProduct={initialProduct}
        />
      </ResetFormWrapper>
    </main>
  );
}
