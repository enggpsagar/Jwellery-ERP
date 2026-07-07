// components/inventory/stock/stock-edit-form.tsx

"use client";

import { useActionState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

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
};


export function StockEditForm({
  stock,
  products,
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
    <form action={formAction}>

      <StockForm
        mode="edit"
        stock={stock}
        products={products}
        state={state}
        pending={pending}
      />

    </form>
  );
}