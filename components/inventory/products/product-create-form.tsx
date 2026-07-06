"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/providers/toast-provider";
import { createProduct } from "@/lib/actions/inventory/product-actions";

import { initialProductFormState } from "@/lib/inventory/product-types";
import { ProductForm } from "./product-form";

export function ProductCreateForm() {
  const router = useRouter();
  const toast = useToast();

  const [state, formAction, pending] = useActionState(
    createProduct,
    initialProductFormState
  );

  useEffect(() => {
    if (state?.success) {
      toast.success(state.message || "Product created successfully");

      const timer = setTimeout(() => {
        router.push("/inventory/products");
        router.refresh();
      }, 800);

      return () => clearTimeout(timer);
    }

    if (state && !state.success && state.message) {
      toast.error(state.message);
    }
  }, [state, router, toast]);

  return (
    <form action={formAction}>
      <ProductForm
        mode="create"
        state={state}
        pending={pending}
      />
    </form>
  );
}