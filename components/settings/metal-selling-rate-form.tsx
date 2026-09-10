"use client";

import { useActionState, useEffect } from "react";

import {
  updateMetalSellingRates,
  type MetalSellingRateRow,
  type PurityFormState,
} from "@/lib/actions/purity-actions";
import { getPurityLabel } from "@/lib/purity";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/providers/toast-provider";

type MetalSellingRateFormProps = {
  rows: MetalSellingRateRow[];
  canEdit: boolean;
};

const initialState: PurityFormState = { success: false, message: "" };

/**
 * Per-karat/fineness selling price — Gold 24K/22K/20K/18K etc. each get
 * their own configurable rate here, unlike StoreMetal.sellingPrice (one
 * flat price per metal name) which stays the mechanism for gemstones
 * (Diamond and other stones don't have karat variants).
 */
export function MetalSellingRateForm({ rows, canEdit }: MetalSellingRateFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateMetalSellingRates,
    initialState,
  );
  const toast = useToast();

  useEffect(() => {
    if (state.message && state.success) {
      toast.success(state.message);
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        formAction(new FormData(event.currentTarget));
      }}
      className="space-y-6"
    >
      <fieldset disabled={!canEdit}>
        <Card>
          <CardHeader>
            <CardTitle>Metal Selling Rates</CardTitle>
            <p className="text-sm text-muted-foreground">
              The selling price per gram for each Gold/Silver/Platinum purity —
              used to prefill a line's Rate on Invoice, Estimate, and
              Quotation. Leave a purity blank to fall back to that metal's
              flat Selling Price (Settings &gt; Metals, Stones &amp; Categories).
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {rows.map((row) => (
              <div key={row.purity} className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
                <Label htmlFor={`sellingPrice_${row.purity}`}>
                  {getPurityLabel(row.purity)}
                </Label>
                <div className="relative">
                  <Input
                    id={`sellingPrice_${row.purity}`}
                    name={`sellingPrice_${row.purity}`}
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={row.sellingPrice ?? ""}
                    placeholder="Not configured"
                    className="pr-10"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    ₹/g
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {canEdit && (
          <div className="mt-6 flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Metal Selling Rates"}
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  );
}
