import Link from "next/link";
import { Plus } from "lucide-react";

import { getInventoryStock } from "@/lib/actions/inventory/stock-actions";

import { Button } from "@/components/ui/button";
import { PageBackHeader } from "@/components/shared/page-back-header";
import { StockTable } from "@/components/inventory/stock/stock-table";

export default async function InventoryStockPage() {
  const stockItems = await getInventoryStock();

  return (
    <main className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <PageBackHeader
          title="Inventory Stock"
          description="Manage physical stock entries for jewellery inventory."
          backHref="/inventory"
          backLabel="Back to Inventory"
        />

        <Link href="/inventory/stock/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Stock
          </Button>
        </Link>
      </div>

      <StockTable stockItems={stockItems} />
    </main>
  );
}