// components/inventory/stock/stock-edit-form.tsx

"use client";

import { useActionState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { PurityType } from "@prisma/client";

import { updateInventoryStock } from "@/lib/actions/inventory/stock-actions";

import {
  initialStockFormState,
  type StockFormState,
} from "@/lib/inventory/stock-types";

import { useToast } from "@/components/providers/toast-provider";

import { StockForm } from "./stock-form";


type StockEditFormProps = {
  stock: any;
  products: any[];
  locations: any[];
  caratConversionRates: Record<PurityType, number>;
};


export function StockEditForm({
  stock,
  products,
  locations,
  caratConversionRates,
}: StockEditFormProps) {

  const router = useRouter();
  const toast = useToast();


  const updateAction = useMemo(() => {
    return updateInventoryStock.bind(null, stock.id);
  }, [stock.id]);


  const [state, formAction, pending] =
    useActionState<StockFormState, FormData>(
      updateAction,
      initialStockFormState
    );


  useEffect(() => {

    if (state.success) {

      toast.success(
        state.message || "Stock updated successfully"
      );


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
        mode="edit"
        stock={stock}
        products={products}
        locations={locations}
        caratConversionRates={caratConversionRates}
        state={state}
        pending={pending}
      />

    </form>
  );
}