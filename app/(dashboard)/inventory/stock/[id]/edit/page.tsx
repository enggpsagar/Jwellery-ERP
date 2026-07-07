// app/(dashboard)/inventory/stock/[id]/edit/page.tsx

import { notFound } from "next/navigation";

import {
  getInventoryStockById,
  getInventoryStockFormProducts,
} from "@/lib/actions/inventory/stock-actions";

import { PageBackHeader } from "@/components/shared/page-back-header";
import { StockEditForm } from "@/components/inventory/stock/stock-edit-form";


type EditInventoryStockPageProps = {
  params: Promise<{
    id: string;
  }>;
};


export default async function EditInventoryStockPage({
  params,
}: EditInventoryStockPageProps) {

  const { id } = await params;


  const [stock, products] = await Promise.all([
    getInventoryStockById(id),
    getInventoryStockFormProducts(),
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
      />

    </main>
  );
}