"use client";

import * as React from "react";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Loader } from "@/components/ui/loader";

import {
  upsertStoreMetal,
  toggleStoreMetalActive,
  deleteStoreMetal,
  getStoreMetalOrigins,
  upsertStoreMetalOrigin,
  toggleStoreMetalOriginActive,
  deleteStoreMetalOrigin,
  upsertStoreCategory,
  toggleStoreCategoryActive,
  deleteStoreCategory,
  getStoreCategoryTypes,
  upsertStoreCategoryType,
  toggleStoreCategoryTypeActive,
  deleteStoreCategoryType,
  type StoreMetalRow,
  type StoreMetalOriginRow,
  type StoreCategoryRow,
  type StoreCategoryTypeRow,
  type TaxonomyFormState,
} from "@/lib/actions/taxonomy-actions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/providers/toast-provider";
// Note: StoneTypesSection below still uses the plain Select above for the
// *parent stone* picker (unchanged) — only the child Stone Type value
// itself moved from a fixed Select to a free-text Input, mirroring
// TypeFormRow under Categories.

const initialState: TaxonomyFormState = { success: false, message: "" };

type TaxonomySettingsFormProps = {
  metals: StoreMetalRow[];
  categories: StoreCategoryRow[];
  canEdit: boolean;
};

export function TaxonomySettingsForm({
  metals,
  categories,
  canEdit,
}: TaxonomySettingsFormProps) {
  // Stones live in the same StoreMetal table as Metals (same metalTypeId FK
  // everywhere a product/stock/invoice/purchase line references one) — this
  // is just a second, filtered view onto the one list getStoreMetals()
  // already fetched, not a separate query.
  const metalRows = metals.filter((metal) => !metal.isGemstone);
  const stoneRows = metals.filter((metal) => metal.isGemstone);

  return (
    <div className="space-y-6">
      <MetalsSection metals={metalRows} canEdit={canEdit} />
      <StonesSection stones={stoneRows} canEdit={canEdit} />
      <StoneTypesSection stones={stoneRows} canEdit={canEdit} />
      <CategoriesSection categories={categories} canEdit={canEdit} />
      <TypesSection categories={categories} canEdit={canEdit} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metals
// ---------------------------------------------------------------------------

function MetalsSection({
  metals,
  canEdit,
}: {
  metals: StoreMetalRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleToggle(id: string, isActive: boolean) {
    try {
      setTogglingId(id);
      const result = await toggleStoreMetalActive(id, isActive);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to update metal");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This can't be undone — it only works if nothing uses it yet.`)) return
    try {
      setDeletingId(id);
      const result = await deleteStoreMetal(id);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete metal");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Metals</CardTitle>
        <p className="text-sm text-muted-foreground">
          The metals your store deals in. &quot;Has Purity&quot; controls whether
          fine-weight/purity conversion applies to items of this metal.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {metals.length === 0 && !showAdd ? (
          <p className="text-sm text-muted-foreground">No metals configured yet.</p>
        ) : null}

        {metals.map((metal) =>
          editingId === metal.id ? (
            <MetalFormRow
              key={metal.id}
              metal={metal}
              onDone={() => setEditingId(null)}
            />
          ) : (
            <div
              key={metal.id}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className={metal.isActive ? "" : "text-muted-foreground line-through"}>
                  {metal.name}
                </span>
                {metal.hasPurity ? (
                  <Badge variant="secondary">Has Purity</Badge>
                ) : null}
              </div>

              {canEdit ? (
                <div className="flex items-center gap-3">
                  <Switch
                    checked={metal.isActive}
                    disabled={togglingId === metal.id}
                    onCheckedChange={(checked) => handleToggle(metal.id, checked)}
                  />
                  <button
                    type="button"
                    onClick={() => setEditingId(metal.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-muted"
                    aria-label={`Edit ${metal.name}`}
                    title="Edit metal"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(metal.id, metal.name)}
                    disabled={deletingId === metal.id}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                    aria-label={`Delete ${metal.name}`}
                    title="Delete metal (only if unused)"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <Badge variant={metal.isActive ? "outline" : "secondary"}>
                  {metal.isActive ? "Active" : "Inactive"}
                </Badge>
              )}
            </div>
          ),
        )}

        {canEdit ? (
          showAdd ? (
            <MetalFormRow onDone={() => setShowAdd(false)} />
          ) : (
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => setShowAdd(true)}
            >
              <Plus className="h-4 w-4" />
              Add Metal
            </Button>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

function MetalFormRow({
  metal,
  onDone,
}: {
  metal?: StoreMetalRow;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState(upsertStoreMetal, initialState);

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
      <input type="hidden" name="id" value={metal?.id ?? ""} />

      <div className="space-y-1.5">
        <Label htmlFor="metal-name" required>Name</Label>
        <Input
          id="metal-name"
          name="name"
          defaultValue={metal?.name ?? ""}
          placeholder="e.g. Diamond"
          required
        />
        {state.errors?.name?.[0] ? (
          <p className="text-sm text-red-600">{state.errors.name[0]}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-2 pb-2">
        <input
          type="checkbox"
          id="metal-hasPurity"
          name="hasPurity"
          defaultChecked={metal?.hasPurity ?? false}
          className="h-4 w-4"
        />
        <Label htmlFor="metal-hasPurity">Has Purity</Label>
      </div>

      <div className="flex gap-2 pb-0.5">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader className="h-4 w-4" /> : "Save"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Stones
// ---------------------------------------------------------------------------
//
// Same StoreMetal table/actions as Metals above (upsertStoreMetal,
// toggleStoreMetalActive, deleteStoreMetal all work by id regardless of
// which section a row is shown under) — this section just always submits
// isGemstone="on" instead of Has Purity. A Stone's Stone Type options
// (Natural, Lab-Grown, Moissanite, or anything else the store adds) no
// longer live on this row (StoreMetal.stoneOrigin is gone) — they're a
// separate, free-text, Store-Admin-managed child list in StoneTypesSection
// below, the exact same two-level split as Categories (this section) /
// Types (TypesSection).

function StonesSection({
  stones,
  canEdit,
}: {
  stones: StoreMetalRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleToggle(id: string, isActive: boolean) {
    try {
      setTogglingId(id);
      const result = await toggleStoreMetalActive(id, isActive);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to update stone");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This can't be undone — it only works if nothing uses it yet.`)) return
    try {
      setDeletingId(id);
      const result = await deleteStoreMetal(id);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete stone");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stones</CardTitle>
        <p className="text-sm text-muted-foreground">
          Gemstones your store deals in — Diamond, Ruby, Emerald, Sapphire,
          and so on. Manage each stone&apos;s Stone Types below (Natural,
          Lab-Grown, or any other type you deal in), since they can price
          very differently.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {stones.length === 0 && !showAdd ? (
          <p className="text-sm text-muted-foreground">No stones configured yet.</p>
        ) : null}

        {stones.map((stone) =>
          editingId === stone.id ? (
            <StoneFormRow
              key={stone.id}
              stone={stone}
              onDone={() => setEditingId(null)}
            />
          ) : (
            <div
              key={stone.id}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className={stone.isActive ? "" : "text-muted-foreground line-through"}>
                  {stone.name}
                </span>
              </div>

              {canEdit ? (
                <div className="flex items-center gap-3">
                  <Switch
                    checked={stone.isActive}
                    disabled={togglingId === stone.id}
                    onCheckedChange={(checked) => handleToggle(stone.id, checked)}
                  />
                  <button
                    type="button"
                    onClick={() => setEditingId(stone.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-muted"
                    aria-label={`Edit ${stone.name}`}
                    title="Edit stone"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(stone.id, stone.name)}
                    disabled={deletingId === stone.id}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                    aria-label={`Delete ${stone.name}`}
                    title="Delete stone (only if unused)"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <Badge variant={stone.isActive ? "outline" : "secondary"}>
                  {stone.isActive ? "Active" : "Inactive"}
                </Badge>
              )}
            </div>
          ),
        )}

        {canEdit ? (
          showAdd ? (
            <StoneFormRow onDone={() => setShowAdd(false)} />
          ) : (
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => setShowAdd(true)}
            >
              <Plus className="h-4 w-4" />
              Add Stone
            </Button>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

function StoneFormRow({
  stone,
  onDone,
}: {
  stone?: StoreMetalRow;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState(upsertStoreMetal, initialState);

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
        // Same deliberate preventDefault + manual dispatch as MetalFormRow —
        // see the comment there for why.
        event.preventDefault()
        formAction(new FormData(event.currentTarget))
      }}
      className="flex flex-wrap items-end gap-3 rounded-md border border-dashed p-3"
    >
      <input type="hidden" name="id" value={stone?.id ?? ""} />
      <input type="hidden" name="isGemstone" value="on" />

      <div className="space-y-1.5">
        <Label htmlFor="stone-name" required>Name</Label>
        <Input
          id="stone-name"
          name="name"
          defaultValue={stone?.name ?? ""}
          placeholder="e.g. Ruby"
          required
        />
        {state.errors?.name?.[0] ? (
          <p className="text-sm text-red-600">{state.errors.name[0]}</p>
        ) : null}
      </div>

      <div className="flex gap-2 pb-0.5">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader className="h-4 w-4" /> : "Save"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Stone Types (cascading under a selected Stone) — the direct mirror of
// Category Types (TypesSection/TypeFormRow) below: a free-text Name input
// the Store Admin manages themselves, not a fixed Natural/Lab-Grown Select.
// ---------------------------------------------------------------------------

function StoneTypesSection({
  stones,
  canEdit,
}: {
  stones: StoreMetalRow[];
  canEdit: boolean;
}) {
  const toast = useToast();

  const [selectedStoneId, setSelectedStoneId] = useState("");
  const [stoneTypes, setStoneTypes] = useState<StoreMetalOriginRow[]>([]);
  const [loadingStoneTypes, setLoadingStoneTypes] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const reloadStoneTypes = React.useCallback(async (storeMetalId: string) => {
    if (!storeMetalId) {
      setStoneTypes([]);
      return;
    }

    try {
      const data = await getStoreMetalOrigins(storeMetalId);
      setStoneTypes(data);
    } catch (error) {
      console.error("Failed to reload Stone Types:", error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadStoneTypes() {
      if (!selectedStoneId) {
        setStoneTypes([]);
        return;
      }

      try {
        setLoadingStoneTypes(true);
        const data = await getStoreMetalOrigins(selectedStoneId);
        if (!cancelled) setStoneTypes(data);
      } catch (error) {
        console.error("Failed to load Stone Types:", error);
        if (!cancelled) setStoneTypes([]);
      } finally {
        if (!cancelled) setLoadingStoneTypes(false);
      }
    }

    setEditingId(null);
    setShowAdd(false);
    loadStoneTypes();

    return () => {
      cancelled = true;
    };
  }, [selectedStoneId]);

  async function handleToggle(id: string, isActive: boolean) {
    try {
      setTogglingId(id);
      const result = await toggleStoreMetalOriginActive(id, isActive);
      if (result.success) {
        toast.success(result.message);
        await reloadStoneTypes(selectedStoneId);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to update Stone Type");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string, label: string) {
    if (!window.confirm(`Delete "${label}"? This can't be undone — it only works if nothing uses it yet.`)) return
    try {
      setDeletingId(id);
      const result = await deleteStoreMetalOrigin(id);
      if (result.success) {
        toast.success(result.message);
        await reloadStoneTypes(selectedStoneId);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete Stone Type");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stone Types</CardTitle>
        <p className="text-sm text-muted-foreground">
          Stone Type options scoped under a stone, e.g. Natural and Lab-Grown
          under Diamond — add as many as your store deals in.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-xs space-y-1.5">
          <Label>Stone</Label>
          <Select value={selectedStoneId} onValueChange={setSelectedStoneId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a stone" />
            </SelectTrigger>
            <SelectContent>
              {stones.map((stone) => (
                <SelectItem key={stone.id} value={stone.id}>
                  {stone.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!selectedStoneId ? (
          <p className="text-sm text-muted-foreground">
            Select a stone to manage its Stone Types.
          </p>
        ) : loadingStoneTypes ? (
          <p className="text-sm text-muted-foreground">Loading Stone Types...</p>
        ) : (
          <div className="space-y-3">
            {stoneTypes.length === 0 && !showAdd ? (
              <p className="text-sm text-muted-foreground">
                No Stone Types configured for this stone yet.
              </p>
            ) : null}

            {stoneTypes.map((option) =>
              editingId === option.id ? (
                <StoneTypeFormRow
                  key={option.id}
                  option={option}
                  storeMetalId={selectedStoneId}
                  onDone={() => setEditingId(null)}
                  onSaved={() => reloadStoneTypes(selectedStoneId)}
                />
              ) : (
                <div
                  key={option.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <span className={option.isActive ? "" : "text-muted-foreground line-through"}>
                    {option.name}
                  </span>

                  {canEdit ? (
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={option.isActive}
                        disabled={togglingId === option.id}
                        onCheckedChange={(checked) => handleToggle(option.id, checked)}
                      />
                      <button
                        type="button"
                        onClick={() => setEditingId(option.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-muted"
                        aria-label={`Edit ${option.name}`}
                        title="Edit Stone Type"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(option.id, option.name)}
                        disabled={deletingId === option.id}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                        aria-label={`Delete ${option.name}`}
                        title="Delete Stone Type (only if unused)"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <Badge variant={option.isActive ? "outline" : "secondary"}>
                      {option.isActive ? "Active" : "Inactive"}
                    </Badge>
                  )}
                </div>
              ),
            )}

            {canEdit ? (
              showAdd ? (
                <StoneTypeFormRow
                  storeMetalId={selectedStoneId}
                  onDone={() => setShowAdd(false)}
                  onSaved={() => reloadStoneTypes(selectedStoneId)}
                />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => setShowAdd(true)}
                >
                  <Plus className="h-4 w-4" />
                  Add Stone Type
                </Button>
              )
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StoneTypeFormRow({
  option,
  storeMetalId,
  onDone,
  onSaved,
}: {
  option?: StoreMetalOriginRow;
  storeMetalId: string;
  onDone: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [state, formAction, pending] = useActionState(
    upsertStoreMetalOrigin,
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.message);
      onSaved();
      onDone();
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      onSubmit={(event) => {
        // Deliberately not `action={formAction}` directly on the form — same
        // reasoning as TypeFormRow above: React would reset uncontrolled
        // fields (like this Name input) on every settled submission,
        // including a failed one, wiping what the user just typed.
        event.preventDefault()
        formAction(new FormData(event.currentTarget))
      }}
      className="flex flex-wrap items-end gap-3 rounded-md border border-dashed p-3"
    >
      <input type="hidden" name="id" value={option?.id ?? ""} />
      <input type="hidden" name="storeMetalId" value={storeMetalId} />

      <div className="space-y-1.5">
        <Label htmlFor="stone-type-name" required>Name</Label>
        <Input
          id="stone-type-name"
          name="name"
          defaultValue={option?.name ?? ""}
          placeholder="e.g. Natural, Lab-Grown, Moissanite"
          required
        />
        {state.errors?.name?.[0] ? (
          <p className="text-sm text-red-600">{state.errors.name[0]}</p>
        ) : null}
      </div>

      <div className="flex gap-2 pb-0.5">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader className="h-4 w-4" /> : "Save"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

function CategoriesSection({
  categories,
  canEdit,
}: {
  categories: StoreCategoryRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleToggle(id: string, isActive: boolean) {
    try {
      setTogglingId(id);
      const result = await toggleStoreCategoryActive(id, isActive);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to update category");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This can't be undone — it only works if nothing uses it yet.`)) return
    try {
      setDeletingId(id);
      const result = await deleteStoreCategory(id);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete category");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Categories</CardTitle>
        <p className="text-sm text-muted-foreground">
          The kinds of goods your store deals in, e.g. Ornament, Coin, Bar, Loose Stone.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {categories.length === 0 && !showAdd ? (
          <p className="text-sm text-muted-foreground">No categories configured yet.</p>
        ) : null}

        {categories.map((category) =>
          editingId === category.id ? (
            <CategoryFormRow
              key={category.id}
              category={category}
              onDone={() => setEditingId(null)}
            />
          ) : (
            <div
              key={category.id}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
            >
              <span className={category.isActive ? "" : "text-muted-foreground line-through"}>
                {category.name}
              </span>

              {canEdit ? (
                <div className="flex items-center gap-3">
                  <Switch
                    checked={category.isActive}
                    disabled={togglingId === category.id}
                    onCheckedChange={(checked) => handleToggle(category.id, checked)}
                  />
                  <button
                    type="button"
                    onClick={() => setEditingId(category.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-muted"
                    aria-label={`Edit ${category.name}`}
                    title="Edit category"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(category.id, category.name)}
                    disabled={deletingId === category.id}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                    aria-label={`Delete ${category.name}`}
                    title="Delete category (only if unused)"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <Badge variant={category.isActive ? "outline" : "secondary"}>
                  {category.isActive ? "Active" : "Inactive"}
                </Badge>
              )}
            </div>
          ),
        )}

        {canEdit ? (
          showAdd ? (
            <CategoryFormRow onDone={() => setShowAdd(false)} />
          ) : (
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => setShowAdd(true)}
            >
              <Plus className="h-4 w-4" />
              Add Category
            </Button>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

function CategoryFormRow({
  category,
  onDone,
}: {
  category?: StoreCategoryRow;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState(
    upsertStoreCategory,
    initialState,
  );

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
      <input type="hidden" name="id" value={category?.id ?? ""} />

      <div className="space-y-1.5">
        <Label htmlFor="category-name" required>Name</Label>
        <Input
          id="category-name"
          name="name"
          defaultValue={category?.name ?? ""}
          placeholder="e.g. Loose Stone"
          required
        />
        {state.errors?.name?.[0] ? (
          <p className="text-sm text-red-600">{state.errors.name[0]}</p>
        ) : null}
      </div>

      <div className="flex gap-2 pb-0.5">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader className="h-4 w-4" /> : "Save"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Category Types (cascading under a selected Category)
// ---------------------------------------------------------------------------

function TypesSection({
  categories,
  canEdit,
}: {
  categories: StoreCategoryRow[];
  canEdit: boolean;
}) {
  const toast = useToast();

  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [types, setTypes] = useState<StoreCategoryTypeRow[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const reloadTypes = React.useCallback(async (categoryId: string) => {
    if (!categoryId) {
      setTypes([]);
      return;
    }

    try {
      const data = await getStoreCategoryTypes(categoryId);
      setTypes(data);
    } catch (error) {
      console.error("Failed to reload types:", error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadTypes() {
      if (!selectedCategoryId) {
        setTypes([]);
        return;
      }

      try {
        setLoadingTypes(true);
        const data = await getStoreCategoryTypes(selectedCategoryId);
        if (!cancelled) setTypes(data);
      } catch (error) {
        console.error("Failed to load types:", error);
        if (!cancelled) setTypes([]);
      } finally {
        if (!cancelled) setLoadingTypes(false);
      }
    }

    setEditingId(null);
    setShowAdd(false);
    loadTypes();

    return () => {
      cancelled = true;
    };
  }, [selectedCategoryId]);

  async function handleToggle(id: string, isActive: boolean) {
    try {
      setTogglingId(id);
      const result = await toggleStoreCategoryTypeActive(id, isActive);
      if (result.success) {
        toast.success(result.message);
        await reloadTypes(selectedCategoryId);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to update type");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This can't be undone — it only works if nothing uses it yet.`)) return
    try {
      setDeletingId(id);
      const result = await deleteStoreCategoryType(id);
      if (result.success) {
        toast.success(result.message);
        await reloadTypes(selectedCategoryId);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete type");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Types</CardTitle>
        <p className="text-sm text-muted-foreground">
          Item types scoped under a category, e.g. Ring / Necklace under Ornament.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-xs space-y-1.5">
          <Label>Category</Label>
          <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!selectedCategoryId ? (
          <p className="text-sm text-muted-foreground">
            Select a category to manage its types.
          </p>
        ) : loadingTypes ? (
          <p className="text-sm text-muted-foreground">Loading types...</p>
        ) : (
          <div className="space-y-3">
            {types.length === 0 && !showAdd ? (
              <p className="text-sm text-muted-foreground">
                No types configured for this category yet.
              </p>
            ) : null}

            {types.map((type) =>
              editingId === type.id ? (
                <TypeFormRow
                  key={type.id}
                  type={type}
                  categoryId={selectedCategoryId}
                  onDone={() => setEditingId(null)}
                  onSaved={() => reloadTypes(selectedCategoryId)}
                />
              ) : (
                <div
                  key={type.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <span className={type.isActive ? "" : "text-muted-foreground line-through"}>
                    {type.name}
                  </span>

                  {canEdit ? (
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={type.isActive}
                        disabled={togglingId === type.id}
                        onCheckedChange={(checked) => handleToggle(type.id, checked)}
                      />
                      <button
                        type="button"
                        onClick={() => setEditingId(type.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-muted"
                        aria-label={`Edit ${type.name}`}
                        title="Edit type"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(type.id, type.name)}
                        disabled={deletingId === type.id}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                        aria-label={`Delete ${type.name}`}
                        title="Delete type (only if unused)"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <Badge variant={type.isActive ? "outline" : "secondary"}>
                      {type.isActive ? "Active" : "Inactive"}
                    </Badge>
                  )}
                </div>
              ),
            )}

            {canEdit ? (
              showAdd ? (
                <TypeFormRow
                  categoryId={selectedCategoryId}
                  onDone={() => setShowAdd(false)}
                  onSaved={() => reloadTypes(selectedCategoryId)}
                />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => setShowAdd(true)}
                >
                  <Plus className="h-4 w-4" />
                  Add Type
                </Button>
              )
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TypeFormRow({
  type,
  categoryId,
  onDone,
  onSaved,
}: {
  type?: StoreCategoryTypeRow;
  categoryId: string;
  onDone: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [state, formAction, pending] = useActionState(
    upsertStoreCategoryType,
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.message);
      onSaved();
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
      <input type="hidden" name="id" value={type?.id ?? ""} />
      <input type="hidden" name="categoryId" value={categoryId} />

      <div className="space-y-1.5">
        <Label htmlFor="type-name" required>Name</Label>
        <Input
          id="type-name"
          name="name"
          defaultValue={type?.name ?? ""}
          placeholder="e.g. Bangle"
          required
        />
        {state.errors?.name?.[0] ? (
          <p className="text-sm text-red-600">{state.errors.name[0]}</p>
        ) : null}
      </div>

      <div className="flex gap-2 pb-0.5">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader className="h-4 w-4" /> : "Save"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
