"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { PurityType } from "@prisma/client";

import { createInventoryStock } from "@/lib/actions/inventory/stock-actions";
import {
  initialStockFormState,
} from "@/lib/inventory/stock-types";
import type { StoreMetalRow } from "@/lib/actions/taxonomy-actions";

import { useToast } from "@/components/providers/toast-provider";
import { StockForm } from "./stock-form";

type StockCreateFormProps = {
  products: any[];
  locations: any[];
  caratConversionRates: Record<PurityType, number>;
  /** The store's configured default location (Settings > Locations),
   * pre-selected in the Location picker below so a new stock entry doesn't
   * start blank. Not threaded into edit mode: an existing stock entry's
   * saved location is untouched by this. */
  defaultLocationId?: string;
  metals: StoreMetalRow[];
  suppliers: { id: string; name: string; phone: string | null }[];
  /** The next sequential STK-{year}-{0001} code (see getNextStockCode) —
   * pre-fills Stock Code so a new entry doesn't start with a blank
   * required field, same "suggested, still editable" convention as
   * Product's own SKU generation. */
  nextStockCode?: string;
};

export function StockCreateForm({ products, locations, caratConversionRates, defaultLocationId, metals, suppliers, nextStockCode }: StockCreateFormProps) {
  const router = useRouter();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);

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
      ref={formRef}
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
        defaultLocationId={defaultLocationId}
        metals={metals}
        suppliers={suppliers}
        nextStockCode={nextStockCode}
        state={state}
        pending={pending}
        formRef={formRef}
      />
    </form>
  );
}