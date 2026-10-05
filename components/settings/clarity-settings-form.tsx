"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Loader } from "@/components/ui/loader";

import {
  upsertStoreStoneClarity,
  toggleStoreStoneClarityActive,
  deleteStoreStoneClarity,
  type StoreStoneClarityRow,
  type TaxonomyFormState,
} from "@/lib/actions/taxonomy-actions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActiveBadge } from "@/components/shared/active-badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/providers/toast-provider";

const initialState: TaxonomyFormState = { success: false, message: "" };

type ClaritySettingsFormProps = {
  clarities: StoreStoneClarityRow[];
  canEdit: boolean;
};

/** Settings list of a store's diamond clarity grades — same shape as
 * StyleSettingsForm. Picked (or quick-added) on the product form's stone rows. */
export function ClaritySettingsForm({ clarities, canEdit }: ClaritySettingsFormProps) {
  const router = useRouter();
  const toast = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleToggle(id: string, isActive: boolean) {
    try {
      setTogglingId(id);
      const result = await toggleStoreStoneClarityActive(id, isActive);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to update clarity");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This can't be undone — it only works if nothing uses it yet.`)) return;
    try {
      setDeletingId(id);
      const result = await deleteStoreStoneClarity(id);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete clarity");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stone Clarity</CardTitle>
        <p className="text-sm text-muted-foreground">
          Clarity / colour grades you tag diamonds with, e.g. FG/VVS-VS, EF/VVS, GH/VS-SI — picked on each stone row of a product.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {clarities.length === 0 && !showAdd ? (
          <p className="text-sm text-muted-foreground">No clarities configured yet.</p>
        ) : null}

        <div className="max-h-72 space-y-2 overflow-y-auto">
          {clarities.map((clarity) =>
            editingId === clarity.id ? (
              <ClarityFormRow key={clarity.id} clarity={clarity} onDone={() => setEditingId(null)} />
            ) : (
              <div
                key={clarity.id}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <span className={clarity.isActive ? "" : "text-muted-foreground line-through"}>
                  {clarity.name}
                </span>

                {canEdit ? (
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={clarity.isActive}
                      disabled={togglingId === clarity.id}
                      onCheckedChange={(checked) => handleToggle(clarity.id, checked)}
                    />
                    <button
                      type="button"
                      onClick={() => setEditingId(clarity.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-blue-50 text-blue-700 transition hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/60"
                      aria-label={`Edit ${clarity.name}`}
                      title="Edit clarity"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(clarity.id, clarity.name)}
                      disabled={deletingId === clarity.id}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-destructive text-destructive-foreground transition hover:bg-destructive/90 disabled:opacity-50"
                      aria-label={`Delete ${clarity.name}`}
                      title="Delete clarity (only if unused)"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <ActiveBadge isActive={clarity.isActive} />
                )}
              </div>
            ),
          )}
        </div>

        {canEdit ? (
          showAdd ? (
            <ClarityFormRow onDone={() => setShowAdd(false)} />
          ) : (
            <Button type="button" className="gap-2" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" />
              Add Clarity
            </Button>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

function ClarityFormRow({
  clarity,
  onDone,
}: {
  clarity?: StoreStoneClarityRow;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState(upsertStoreStoneClarity, initialState);

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
        // Deliberately not `action={formAction}` directly on the form —
        // same auto-reset workaround as every other action-bound form in
        // this app (see CategoryFormRow's own comment).
        event.preventDefault();
        formAction(new FormData(event.currentTarget));
      }}
      className="flex flex-wrap items-end gap-3 rounded-md border border-dashed p-3"
    >
      <input type="hidden" name="id" value={clarity?.id ?? ""} />

      <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
        <Label htmlFor="clarity-name" required>Name</Label>
        <Input
          id="clarity-name"
          name="name"
          defaultValue={clarity?.name ?? ""}
          placeholder="e.g. FG/VVS-VS"
          required
        />
        {state.errors?.name?.[0] ? (
          <p className="text-sm text-red-600">{state.errors.name[0]}</p>
        ) : null}
      </div>

      <div className="flex justify-end gap-2 pb-0.5">
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader className="h-4 w-4" /> : clarity ? "Update" : "Save"}
        </Button>
      </div>
    </form>
  );
}
