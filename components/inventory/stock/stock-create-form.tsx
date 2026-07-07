"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { createInventoryStock } from "@/lib/actions/inventory/stock-actions";
import {
  initialStockFormState,
} from "@/lib/inventory/stock-types";

import { useToast } from "@/components/providers/toast-provider";
import { StockForm } from "./stock-form";

export function StockCreateForm() {
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
    <form action={formAction}>
      <StockForm
        mode="create"
        state={state}
        pending={pending}
      />
    </form>
  );
}