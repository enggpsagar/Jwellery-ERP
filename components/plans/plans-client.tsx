"use client";

import * as React from "react";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Loader } from "@/components/ui/loader";

import {
  createPlan,
  updatePlan,
  setPlanActive,
  type PlanRow,
  type PlanFormState,
} from "@/lib/actions/plan-actions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/providers/toast-provider";

const initialState: PlanFormState = { success: false, message: "" };

function formatPrice(price: number) {
  return price > 0 ? `₹${price.toLocaleString("en-IN")}` : "Free";
}

export function PlansClient({ plans }: { plans: PlanRow[] }) {
  const router = useRouter();
  const toast = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function handleToggle(id: string, isActive: boolean) {
    try {
      setTogglingId(id);
      const result = await setPlanActive(id, isActive);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to update plan");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Plans</h1>
        <p className="text-muted-foreground">
          The subscription tiers stores can be assigned — deactivating a plan
          hides it from the store-creation picker without touching stores
          already on it.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Plan Catalog</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {plans.length === 0 && !showAdd ? (
            <p className="text-sm text-muted-foreground">No plans configured yet.</p>
          ) : null}

          {plans.map((plan) =>
            editingId === plan.id ? (
              <PlanFormRow key={plan.id} plan={plan} onDone={() => setEditingId(null)} />
            ) : (
              <div
                key={plan.id}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className={plan.isActive ? "font-medium" : "font-medium text-muted-foreground line-through"}>
                    {plan.name}
                  </span>
                  <Badge variant="secondary">{plan.durationDays} days</Badge>
                  <Badge variant="outline">{formatPrice(plan.price)}</Badge>
                </div>

                <div className="flex items-center gap-3">
                  <Switch
                    checked={plan.isActive}
                    disabled={togglingId === plan.id}
                    onCheckedChange={(checked) => handleToggle(plan.id, checked)}
                  />
                  <button
                    type="button"
                    onClick={() => setEditingId(plan.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-muted"
                    aria-label={`Edit ${plan.name}`}
                    title="Edit plan"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ),
          )}

          {showAdd ? (
            <PlanFormRow onDone={() => setShowAdd(false)} />
          ) : (
            <Button type="button" variant="outline" className="gap-2" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" />
              Add Plan
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PlanFormRow({ plan, onDone }: { plan?: PlanRow; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState(plan ? updatePlan : createPlan, initialState);

  useEffect(() => {
    if (state.success) {
      toast.success(state.message);
      router.refresh();
      onDone();
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

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
      className="flex flex-wrap items-end gap-3 rounded-md border border-dashed p-3"
    >
      <input type="hidden" name="id" value={plan?.id ?? ""} />

      <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
        <Label htmlFor="plan-name" required>Name</Label>
        <Input
          id="plan-name"
          name="name"
          defaultValue={plan?.name ?? ""}
          placeholder="e.g. 90 Days"
          required
        />
        {state.errors?.name?.[0] ? (
          <p className="text-sm text-red-600">{state.errors.name[0]}</p>
        ) : null}
      </div>

      <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
        <Label htmlFor="plan-durationDays" required>Duration (days)</Label>
        <Input
          id="plan-durationDays"
          name="durationDays"
          type="number"
          min={1}
          step={1}
          className="w-32"
          defaultValue={plan?.durationDays ?? ""}
          required
        />
        {state.errors?.durationDays?.[0] ? (
          <p className="text-sm text-red-600">{state.errors.durationDays[0]}</p>
        ) : null}
      </div>

      <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
        <Label htmlFor="plan-price" required>Price (₹)</Label>
        <Input
          id="plan-price"
          name="price"
          type="number"
          min={0}
          step="0.01"
          className="w-32"
          defaultValue={plan?.price ?? 0}
          required
        />
        {state.errors?.price?.[0] ? (
          <p className="text-sm text-red-600">{state.errors.price[0]}</p>
        ) : null}
      </div>

      <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
        <Label htmlFor="plan-sortOrder">Sort Order</Label>
        <Input
          id="plan-sortOrder"
          name="sortOrder"
          type="number"
          step={1}
          className="w-24"
          defaultValue={plan?.sortOrder ?? 0}
        />
      </div>

      <div className="flex justify-end gap-2 pb-0.5">
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader className="h-4 w-4" /> : "Save"}
        </Button>
      </div>
    </form>
  );
}
