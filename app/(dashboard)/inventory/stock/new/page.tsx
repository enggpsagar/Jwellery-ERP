import { getInventoryStockFormProducts } from "@/lib/actions/inventory/stock-actions";
import { getStoreMetals } from "@/lib/actions/taxonomy-actions";

import { PageBackHeader } from "@/components/shared/page-back-header";
import { StockCreateForm } from "@/components/inventory/stock/stock-create-form";


export default async function NewStockPage() {

  const [products, metals] = await Promise.all([
    getInventoryStockFormProducts(),
    getStoreMetals(),
  ]);

  return (
    <main className="space-y-6 p-6">

      <PageBackHeader
        title="Add Stock"
        description="Create a new jewellery inventory stock entry."
        backHref="/inventory/stock"
        backLabel="Back to Stock"
      />

      <StockCreateForm
        products={products}
        metals={metals}
      />

    </main>
  );
}