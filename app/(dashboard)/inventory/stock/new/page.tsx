import type { Metadata } from "next";

import { getInventoryStockFormProducts } from "@/lib/actions/inventory/stock-actions";
import {
  getDefaultLocationId,
  getStoreLocations,
} from "@/lib/actions/store-location-actions";
import { getCaratConversionRateMap } from "@/lib/actions/purity-actions";
import { getStoreMetals } from "@/lib/actions/taxonomy-actions";

import { ResetFormWrapper } from "@/components/shared/reset-form-wrapper";
import { StockCreateForm } from "@/components/inventory/stock/stock-create-form";

export const metadata: Metadata = {
  title: "Add Stock",
};

export default async function NewStockPage() {

  const [products, locations, caratConversionRates, defaultLocationId, metals] = await Promise.all([
    getInventoryStockFormProducts(),
    getStoreLocations(),
    getCaratConversionRateMap(),
    getDefaultLocationId(),
    getStoreMetals(),
  ]);

  return (
    <main className="space-y-6 p-6">

      <ResetFormWrapper
        header={{
          title: "Add Stock",
          description: "Create a new jewellery inventory stock entry.",
          backHref: "/inventory/stock",
          backLabel: "Back to Stock",
        }}
      >
        <StockCreateForm
          products={products}
          locations={locations}
          caratConversionRates={caratConversionRates}
          defaultLocationId={defaultLocationId ?? undefined}
          metals={metals}
        />
      </ResetFormWrapper>

    </main>
  );
}