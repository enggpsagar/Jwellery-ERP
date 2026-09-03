"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { PurityType } from "@prisma/client";

import { useToast } from "@/components/providers/toast-provider";
import { createProduct } from "@/lib/actions/inventory/product-actions";

import { initialProductFormState } from "@/lib/inventory/product-types";
import {
  ProductForm,
  type StoreCategoryOption,
  type StoreMetalOption,
} from "./product-form";

type ProductCreateFormProps = {
  metals: StoreMetalOption[];
  categories: StoreCategoryOption[];
  caratConversionRates: Record<PurityType, number>;
  /** Where to go after saving; the new product's id is appended so the
   * calling screen can select it. */
  returnTo?: string
};

export function ProductCreateForm({
  metals,
  categories,
  caratConversionRates,
  returnTo,
}: ProductCreateFormProps) {
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
        // Hand the new id back to whoever sent us here (e.g. a purchase in
        // progress) so it can be selected on arrival instead of the user
        // having to find it in the list.
        if (returnTo && state.product) {
          const separator = returnTo.includes("?") ? "&" : "?";
          router.push(`${returnTo}${separator}newProductId=${state.product.id}`);
        } else {
          router.push("/inventory/products");
        }

        router.refresh();
      }, 800);

      return () => clearTimeout(timer);
    }

    if (state && !state.success && state.message) {
      toast.error(state.message);
    }
  }, [state, router, toast, returnTo]);

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
        mode="create"
        state={state}
        pending={pending}
        metals={metals}
        categories={categories}
        caratConversionRates={caratConversionRates}
      />
    </form>
  );
}