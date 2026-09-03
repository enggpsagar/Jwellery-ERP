"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { PurityType } from "@prisma/client";

import { createInventoryStock } from "@/lib/actions/inventory/stock-actions";
import {
  initialStockFormState,
} from "@/lib/inventory/stock-types";

import { useToast } from "@/components/providers/toast-provider";
import { StockForm } from "./stock-form";

type StockCreateFormProps = {
  products: any[];
  locations: any[];
  caratConversionRates: Record<PurityType, number>;
};

export function StockCreateForm({ products, locations, caratConversionRates }: StockCreateFormProps) {
  const router = useRouter();
  const toast = useToast();

  const [state, formAction, pending] = useActionState(
    createInventoryStock,
    initialStockFormState
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Stock added successfully");

      const timer = setTimeout(() => {
        router.push("/inventory/stock");
        router.refresh();
      }, 800);

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
      <StockForm
        mode="create"
        products={products}
        locations={locations}
        caratConversionRates={caratConversionRates}
        state={state}
        pending={pending}
      />
    </form>
  );
}