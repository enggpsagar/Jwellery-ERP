"use client";

import { useActionState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

import { updateProduct } from "@/lib/actions/inventory/product-actions";
import {
  initialProductFormState,
  type ProductFormState,
} from "@/lib/inventory/product-types";

import { useToast } from "@/components/providers/toast-provider";
import {
  ProductForm,
  type StoreCategoryOption,
  type StoreMetalOption,
} from "./product-form";

type EditProductFormProps = {
  product: {
    id: string;
    productCode: string;
    name: string;
    categoryId: string | null;
    categoryTypeId: string | null;
    metalTypeId: string | null;
    defaultPurity: string | null;
    defaultMakingCharge: string | null;
    defaultStoneCharge: string | null;
    designCode: string | null;
    hsnCode: string | null;
    description: string | null;
    notes: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  };
  metals: StoreMetalOption[];
  categories: StoreCategoryOption[];
};

export function EditProductForm({
  product,
  metals,
  categories,
}: EditProductFormProps) {
  const router = useRouter();
  const toast = useToast();

  const updateAction = useMemo(() => {
    return updateProduct.bind(null, product.id);
  }, [product.id]);

  const [state, formAction, pending] =
    useActionState<ProductFormState, FormData>(
      updateAction,
      initialProductFormState
    );

  useEffect(() => {
    if (state.success) {
      toast.success(
        state.message || "Product updated successfully"
      );

      const timer = setTimeout(() => {
        router.push("/inventory/products");
        router.refresh();
      }, 1500);

      return () => clearTimeout(timer);
    }

    if (!state.success && state.message) {
      toast.error(state.message);
    }
  }, [state, router, toast]);

  return (
    <form action={formAction}>
      <ProductForm
        mode="edit"
        product={product}
        state={state}
        pending={pending}
        metals={metals}
        categories={categories}
      />
    </form>
  );
}