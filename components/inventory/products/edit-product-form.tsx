"use client";

import { useActionState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

import { updateProduct } from "@/lib/actions/inventory/product-actions";
import {
  initialProductFormState,
  type ProductFormState,
} from "@/lib/inventory/product-types";

import { ProductForm } from "./product-form";

type EditProductFormProps = {
  product: {
    id: string;
    productCode: string;
    name: string;
    category: string;
    ornamentType: string | null;
    metalType: string;
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
};

export function EditProductForm({
  product,
}: EditProductFormProps) {
  const router = useRouter();

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
      router.push("/inventory/products");
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <form action={formAction}>
      <ProductForm
        mode="edit"
        product={product}
        state={state}
        pending={pending}
      />
    </form>
  );
}