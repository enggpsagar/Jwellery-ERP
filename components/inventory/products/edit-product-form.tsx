"use client";

import { useActionState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { PurityType } from "@prisma/client";

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
    stoneOriginOptionId: string | null;
    defaultPurity: string | null;
    defaultMakingCharge: string | null;
    defaultMakingChargeType: "FIXED" | "PERCENTAGE" | null;
    defaultStoneCharge: string | null;
    defaultStoneChargeType: "FIXED" | "PERCENTAGE" | null;
    defaultGrossWeight: string | null;
    defaultNetWeight: string | null;
    defaultStoneWeight: string | null;
    defaultCaratWeight: string | null;
    hasStoneComponent: boolean;
    defaultStoneRate: string | null;
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
  caratConversionRates: Record<PurityType, number>;
};

export function EditProductForm({
  product,
  metals,
  categories,
  caratConversionRates,
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
    <form
      onSubmit={(event) => {
        // Deliberately not `action={formAction}` directly on the form:
        // React resets a form's uncontrolled fields once an action-bound
        // submission settles, regardless of whether the action's own
        // returned state says success or failure — so a plain validation
        // error wiped every other field the user had already typed.
        // Calling the same dispatcher by hand from a prevented submit
        // sidesteps that auto-reset while keeping identical pending/error-
        // state behavior.
        event.preventDefault();
        formAction(new FormData(event.currentTarget));
      }}
    >
      <ProductForm
        mode="edit"
        product={product}
        state={state}
        pending={pending}
        metals={metals}
        categories={categories}
        caratConversionRates={caratConversionRates}
      />
    </form>
  );
}