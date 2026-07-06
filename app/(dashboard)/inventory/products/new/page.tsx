import { ProductCreateForm } from "@/components/inventory/products/product-create-form";
import { PageBackHeader } from "@/components/shared/page-back-header";

export default function NewProductPage() {
  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Add Product"
        description="Create a new jewellery product master."
        backHref="/inventory/products"
        backLabel="Back to Products"
      />

      <ProductCreateForm />
    </main>
  );
}