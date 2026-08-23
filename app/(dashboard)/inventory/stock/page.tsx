import { getInventoryStock } from "@/lib/actions/inventory/stock-actions";

import { StockClient } from "@/components/inventory/stock/stock-client";

export default async function InventoryStockPage() {
  const stockItems = await getInventoryStock();

  return <StockClient stockItems={stockItems} />;
}