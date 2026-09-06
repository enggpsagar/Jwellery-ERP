"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Star } from "lucide-react";
import { Loader } from "@/components/ui/loader";

import {
  upsertGstRate,
  setGstRateActive,
  setDefaultGstRate,
  type GstRateRow,
  type GstRateFormState,
} from "@/lib/actions/gst-rate-actions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/providers/toast-provider";

const initialState: GstRateFormState = { success: false, message: "" };

type GstRateSettingsFormProps = {
  rates: GstRateRow[];
  canEdit: boolean;
};

export function GstRateSettingsForm({ rates, canEdit }: GstRateSettingsFormProps) {
  const router = useRouter();
  const toast = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);

  async function handleToggle(id: string, isActive: boolean) {
    try {
      setTogglingId(id);
      const result = await setGstRateActive(id, isActive);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to update GST rate");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleSetDefault(id: string) {
    try {
      setSettingDefaultId(id);
      const result = await setDefaultGstRate(id);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to update default GST rate");
    } finally {
      setSettingDefaultId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>GST Rates</CardTitle>
        <p className="text-sm text-muted-foreground">
          The GST rates available when creating an Invoice, Purchase, or
          Quotation. Deactivating a rate removes it from the picker for new
          documents without changing any document that already used it.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {rates.length === 0 && !showAdd ? (
          <p className="text-sm text-muted-foreground">No GST rates configured yet.</p>
        ) : null}

        {rates.map((rate) =>
          editingId === rate.id ? (
            <GstRateFormRow key={rate.id} rate={rate} onDone={() => setEditingId(null)} />
          ) : (
            <div
              key={rate.id}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
            >
              <div className={rate.isActive ? "" : "text-muted-foreground line-through"}>
                <div className="flex items-center gap-2">
                  {rate.name}
                  <span className="text-sm text-muted-foreground">
                    ({rate.ratePercent}%)
                  </span>
                  {rate.isDefault && (
                    <Badge variant="outline" className="gap-1 font-normal">
                      <Star className="h-3 w-3 fill-current" />
                      Default
                    </Badge>
                  )}
                </div>
              </div>

              {canEdit ? (
                <div className="flex items-center gap-3">
                  {!rate.isDefault && rate.isActive && (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(rate.id)}
                      disabled={settingDefaultId === rate.id}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted disabled:opacity-50"
                      title="Set as default rate"
                    >
                      {settingDefaultId === rate.id ? (
                        <Loader className="h-3 w-3" />
                      ) : (
                        <Star className="h-3 w-3" />
                      )}
                      Set as Default
                    </button>
                  )}
                  <Switch
                    checked={rate.isActive}
                    disabled={togglingId === rate.id}
                    onCheckedChange={(checked) => handleToggle(rate.id, checked)}
                  />
                  <button
                    type="button"
                    onClick={() => setEditingId(rate.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-muted"
                    aria-label={`Edit ${rate.name}`}
                    title="Edit GST rate"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <Badge variant={rate.isActive ? "outline" : "secondary"}>
                  {rate.isActive ? "Active" : "Inactive"}
                </Badge>
              )}
            </div>
          ),
        )}

        {canEdit ? (
          showAdd ? (
            <GstRateFormRow onDone={() => setShowAdd(false)} />
          ) : (
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => setShowAdd(true)}
            >
              <Plus className="h-4 w-4" />
              Add GST Rate
            </Button>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

function GstRateFormRow({
  rate,
  onDone,
}: {
  rate?: GstRateRow;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState(upsertGstRate, initialState);

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
      <input type="hidden" name="id" value={rate?.id ?? ""} />

      <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
        <Label htmlFor="gst-rate-name" required>Name</Label>
        <Input
          id="gst-rate-name"
          name="name"
          defaultValue={rate?.name ?? ""}
          placeholder="e.g. Making Charges"
          required
        />
        {state.errors?.name?.[0] ? (
          <p className="text-sm text-red-600">{state.errors.name[0]}</p>
        ) : null}
      </div>

      <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
        <Label htmlFor="gst-rate-percent" required>Rate</Label>
        <div className="relative">
          <Input
            id="gst-rate-percent"
            name="ratePercent"
            type="number"
            step="0.01"
            min="0"
            max="100"
            defaultValue={rate?.ratePercent ?? ""}
            placeholder="e.g. 3"
            className="pr-8"
            required
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            %
          </span>
        </div>
        {state.errors?.ratePercent?.[0] ? (
          <p className="text-sm text-red-600">{state.errors.ratePercent[0]}</p>
        ) : null}
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
