"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Loader } from "@/components/ui/loader";

import {
  upsertStoreStyle,
  toggleStoreStyleActive,
  deleteStoreStyle,
  type StoreStyleRow,
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

type StyleSettingsFormProps = {
  styles: StoreStyleRow[];
  canEdit: boolean;
};

/**
 * Add/Edit/Deactivate/Delete for Product's "Style" master data (Ladies/
 * Gents/Kids/Unisex by default, freely renamable/extendable per store) —
 * see Product.targetStyleId's own schema comment for why this replaced a
 * fixed enum. Same shape as TaxonomySettingsForm's own Categories section
 * (components/settings/taxonomy-settings-form.tsx), just for StoreStyle
 * instead of StoreCategory — Style never needed a cascading sub-level, so
 * this is the whole component rather than a section within a bigger one.
 */
export function StyleSettingsForm({ styles, canEdit }: StyleSettingsFormProps) {
  const router = useRouter();
  const toast = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleToggle(id: string, isActive: boolean) {
    try {
      setTogglingId(id);
      const result = await toggleStoreStyleActive(id, isActive);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to update style");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This can't be undone — it only works if nothing uses it yet.`)) return;
    try {
      setDeletingId(id);
      const result = await deleteStoreStyle(id);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete style");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Styles</CardTitle>
        <p className="text-sm text-muted-foreground">
          Who a design is made for, e.g. Ladies, Gents, Kids, Unisex — used on the product form
          (when "Require Style on products" below is on) and in the auto-generated SKU.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {styles.length === 0 && !showAdd ? (
          <p className="text-sm text-muted-foreground">No styles configured yet.</p>
        ) : null}

        {styles.map((style) =>
          editingId === style.id ? (
            <StyleFormRow key={style.id} style={style} onDone={() => setEditingId(null)} />
          ) : (
            <div
              key={style.id}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
            >
              <span className={style.isActive ? "" : "text-muted-foreground line-through"}>
                {style.name}
              </span>

              {canEdit ? (
                <div className="flex items-center gap-3">
                  <Switch
                    checked={style.isActive}
                    disabled={togglingId === style.id}
                    onCheckedChange={(checked) => handleToggle(style.id, checked)}
                  />
                  <button
                    type="button"
                    onClick={() => setEditingId(style.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-blue-50 text-blue-700 transition hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/60"
                    aria-label={`Edit ${style.name}`}
                    title="Edit style"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(style.id, style.name)}
                    disabled={deletingId === style.id}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-destructive text-destructive-foreground transition hover:bg-destructive/90 disabled:opacity-50"
                    aria-label={`Delete ${style.name}`}
                    title="Delete style (only if unused)"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <ActiveBadge isActive={style.isActive} />
              )}
            </div>
          ),
        )}

        {canEdit ? (
          showAdd ? (
            <StyleFormRow onDone={() => setShowAdd(false)} />
          ) : (
            <Button type="button" className="gap-2" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" />
              Add Style
            </Button>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

function StyleFormRow({
  style,
  onDone,
}: {
  style?: StoreStyleRow;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState(upsertStoreStyle, initialState);

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
      <input type="hidden" name="id" value={style?.id ?? ""} />

      <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
        <Label htmlFor="style-name" required>Name</Label>
        <Input
          id="style-name"
          name="name"
          defaultValue={style?.name ?? ""}
          placeholder="e.g. Ladies"
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
          {pending ? <Loader className="h-4 w-4" /> : style ? "Update" : "Save"}
        </Button>
      </div>
    </form>
  );
}
