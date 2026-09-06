// app/(dashboard)/inventory/stock/[id]/edit/page.tsx

import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";

import {
  getInventoryStockById,
  getInventoryStockFormProducts,
} from "@/lib/actions/inventory/stock-actions";
import { getStoreLocations } from "@/lib/actions/store-location-actions";
import { getCaratConversionRateMap } from "@/lib/actions/purity-actions";

import { PageBackHeader } from "@/components/shared/page-back-header";
import { StockEditForm } from "@/components/inventory/stock/stock-edit-form";


type EditInventoryStockPageProps = {
  params: Promise<{
    id: string;
  }>;
};

const getInventoryStock = cache(getInventoryStockById);

export async function generateMetadata({
  params,
}: EditInventoryStockPageProps): Promise<Metadata> {
  try {
    const { id } = await params;
    const stock = await getInventoryStock(id);
    return { title: stock ? `Edit ${stock.stockCode}` : "Edit Stock" };
  } catch {
    return { title: "Edit Stock" };
  }
}

export default async function EditInventoryStockPage({
  params,
}: EditInventoryStockPageProps) {

  const { id } = await params;


  const [stock, products, locations, caratConversionRates] = await Promise.all([
    getInventoryStock(id),
    getInventoryStockFormProducts(),
    getStoreLocations(),
    getCaratConversionRateMap(),
  ]);


  if (!stock) {
    notFound();
  }


  return (
    <main className="space-y-6 p-6">

      <PageBackHeader
        title="Edit Stock"
        description="Update inventory stock details."
        backHref="/inventory/stock"
        backLabel="Back to Stock"
      />


      <StockEditForm
        stock={stock}
        products={products}
        locations={locations}
        caratConversionRates={caratConversionRates}
      />

    </main>
  );
}