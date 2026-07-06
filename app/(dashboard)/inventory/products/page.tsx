import Link from "next/link";

import { getProducts } from "@/lib/actions/inventory/product-actions";

import { ProductsTable } from "@/components/inventory/products/products-table";
import { PageBackHeader } from "@/components/shared/page-back-header";
import { Button } from "@/components/ui/button";

export default async function InventoryProductsPage() {
  const products = await getProducts();

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Products"
        description="Manage jewellery product masters."
        backHref="/inventory"
        backLabel="Back to Inventory"
        action={
          <Link href="/inventory/products/new">
            <Button>Add Product</Button>
          </Link>
        }
      />

      <ProductsTable products={products} />
    </main>
  );
}