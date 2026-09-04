"use client";

import { useActionState } from "react";

import {
  updatePurityFineness,
  type PurityFinenessRow,
  type PurityFormState,
} from "@/lib/actions/purity-actions";
import { getPurityLabel } from "@/lib/purity";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PurityFormProps = {
  rows: PurityFinenessRow[];
  canEdit: boolean;
};

const initialState: PurityFormState = { success: false, message: "" };

export function PuritySettingsForm({ rows, canEdit }: PurityFormProps) {
  const [state, formAction, isPending] = useActionState(
    updatePurityFineness,
    initialState,
  );

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
        event.preventDefault()
        formAction(new FormData(event.currentTarget))
      }}
      className="space-y-6"
    >
      {!canEdit ? (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Only the Store Owner can edit these settings. You have view-only access.
        </div>
      ) : null}

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
            <CardTitle>Purity / Carat Fineness</CardTitle>
            <p className="text-sm text-muted-foreground">
              The fine-metal percentage for each purity. Used to convert gold/silver
              issued to and received from a Karigar into a common fine-weight basis.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {rows.map((row) => (
              <div key={row.purity} className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
                <Label htmlFor={`fineness_${row.purity}`}>
                  {getPurityLabel(row.purity)}
                </Label>
                <div className="relative">
                  <Input
                    id={`fineness_${row.purity}`}
                    name={`fineness_${row.purity}`}
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    defaultValue={row.finenessPercent}
                    className="pr-8"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {canEdit && (
          <div className="mt-6 flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Purity Settings"}
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  );
}
