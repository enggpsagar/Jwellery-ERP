"use client";

import { useActionState } from "react";

import {
  updateCaratConversionRates,
  type CaratConversionRateRow,
  type PurityFormState,
} from "@/lib/actions/purity-actions";
import { getPurityLabel } from "@/lib/purity";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type CaratConversionFormProps = {
  rows: CaratConversionRateRow[];
  canEdit: boolean;
};

const initialState: PurityFormState = { success: false, message: "" };

/**
 * How many grams one carat is worth, per purity — separate from
 * PuritySettingsForm's fineness table (a different number entirely; see
 * CaratConversionRate's own schema comment) but the same shape/pattern,
 * submitted as its own form so saving one doesn't require re-submitting
 * the other.
 */
export function CaratConversionForm({ rows, canEdit }: CaratConversionFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateCaratConversionRates,
    initialState,
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        formAction(new FormData(event.currentTarget));
      }}
      className="space-y-6"
    >
      {state.message ? (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            state.success
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {state.message}
        </div>
      ) : null}

      <fieldset disabled={!canEdit}>
        <Card>
          <CardHeader>
            <CardTitle>Carat Conversion Rules</CardTitle>
            <p className="text-sm text-muted-foreground">
              Grams per carat, used everywhere a Carat Weight is converted to/from a
              gram weight — adding a product, adding stock, and every billing document
              (Invoice, Purchase, Kacha Slip, Quotation). Defaults to 0.2g/ct, the
              standard diamond carat; override a purity here only if your store uses a
              different convention.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {rows.map((row) => (
              <div key={row.purity} className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
                <Label htmlFor={`gramsPerCarat_${row.purity}`}>
                  {getPurityLabel(row.purity)}
                </Label>
                <div className="relative">
                  <Input
                    id={`gramsPerCarat_${row.purity}`}
                    name={`gramsPerCarat_${row.purity}`}
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    defaultValue={row.gramsPerCarat}
                    className="pr-16"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    g/ct
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {canEdit && (
          <div className="mt-6 flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Carat Conversion Rules"}
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  );
}
