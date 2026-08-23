import { ProductCreateForm } from "@/components/inventory/products/product-create-form";
import { PageBackHeader } from "@/components/shared/page-back-header";
import {
  getStoreCategories,
  getStoreMetals,
} from "@/lib/actions/taxonomy-actions";

export default async function NewProductPage() {
  const [metals, categories] = await Promise.all([
    getStoreMetals(),
    getStoreCategories(),
  ]);

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Add Product"
        description="Create a new jewellery product master."
        backHref="/inventory/products"
        backLabel="Back to Products"
      />

      <ProductCreateForm metals={metals} categories={categories} />
    </main>
  );
}