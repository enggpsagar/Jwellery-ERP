"use client";

import { useActionState, useEffect, useState } from "react";
import type { SkuFormat } from "@prisma/client";

import { updateSkuFormat } from "@/lib/actions/settings-actions";
import type { SettingsFormState } from "@/lib/actions/settings-actions";
import { SKU_FORMAT_OPTIONS, exampleSkuForFormat } from "@/lib/inventory/product-sku";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/providers/toast-provider";
import { cn } from "@/lib/utils";

type SkuFormatFormProps = {
  skuFormat: SkuFormat;
  canEdit: boolean;
  /** First active metal/category by name, so the example's letters are the
   * store's own rather than a hardcoded stock photo — see
   * exampleSkuForFormat's own doc comment for why purity/style stay fixed. */
  sampleMetalName: string;
  sampleCategoryName: string;
};

const initialState: SettingsFormState = { success: false, message: "" };

/**
 * Which of the four SKU layouts (see SkuFormat's own schema comment)
 * createProduct arranges Metal/Purity/Style/Category into. Its own small
 * form/action — same "separate widget, separate submit" convention as
 * CaratConversionForm/MetalSellingRateForm — so picking a format doesn't
 * require resubmitting the whole Business Settings form.
 */
export function SkuFormatForm({
  skuFormat,
  canEdit,
  sampleMetalName,
  sampleCategoryName,
}: SkuFormatFormProps) {
  const [state, formAction, isPending] = useActionState(updateSkuFormat, initialState);
  const toast = useToast();
  const [selected, setSelected] = useState<SkuFormat>(skuFormat);

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
      <input type="hidden" name="skuFormat" value={selected} />
      <fieldset disabled={!canEdit}>
        <Card>
          <CardHeader>
            <CardTitle>SKU Format</CardTitle>
            <p className="text-sm text-muted-foreground">
              How a new product's SKU (its productCode) is laid out — built from Metal,
              Purity, Style, and Category. The example under each option uses your own
              store's metal/category names with an illustrative purity and style, so
              you can compare the layouts directly. Only affects products created after
              you save; existing SKUs are never rewritten.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {SKU_FORMAT_OPTIONS.map((option) => {
              const isSelected = selected === option.value;
              const example = exampleSkuForFormat(option.value, {
                metalName: sampleMetalName,
                categoryName: sampleCategoryName,
              });

              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setSelected(option.value)}
                  className={cn(
                    "rounded-lg border p-4 text-left transition-colors",
                    isSelected
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "hover:bg-accent/40",
                  )}
                >
                  <p className="font-medium">{option.label}</p>
                  <p className="mt-1 font-mono text-lg">{example}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {canEdit && (
          <div className="mt-6 flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save SKU Format"}
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  );
}
