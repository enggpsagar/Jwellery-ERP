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
  getStoreMetalPurities,
  upsertStoreMetalPurity,
  toggleStoreMetalPurityActive,
  deleteStoreMetalPurity,
  upsertStoreCategory,
  toggleStoreCategoryActive,
  deleteStoreCategory,
  updateStoreCategoryMetalTags,
  getStoreCategoryTypes,
  upsertStoreCategoryType,
  toggleStoreCategoryTypeActive,
  deleteStoreCategoryType,
  type StoreMetalRow,
  type StoreMetalOriginRow,
  type StoreMetalPurityRow,
  type StoreCategoryRow,
  type StoreCategoryTypeRow,
  type TaxonomyFormState,
} from "@/lib/actions/taxonomy-actions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ActiveBadge } from "@/components/shared/active-badge";
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
import { MetalCategoryImportDialog } from "@/components/settings/metal-category-import-dialog";
import { StoneTypeImportDialog } from "@/components/settings/stone-type-import-dialog";
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

      <PuritiesSection metals={metalRows} canEdit={canEdit} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <StonesSection stones={stoneRows} canEdit={canEdit} />
        <StoneTypesSection stones={stoneRows} canEdit={canEdit} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CategoriesSection categories={categories} metals={metalRows.concat(stoneRows)} canEdit={canEdit} />
        <TypesSection categories={categories} canEdit={canEdit} />
      </div>
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
                <Badge variant="outline">
                  {metal.primaryUnit === "CARAT" ? "Carat" : "Gram"}
                </Badge>
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
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-blue-50 text-blue-700 transition hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/60"
                    aria-label={`Edit ${metal.name}`}
                    title="Edit metal"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(metal.id, metal.name)}
                    disabled={deletingId === metal.id}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-destructive text-destructive-foreground transition hover:bg-destructive/90 disabled:opacity-50"
                    aria-label={`Delete ${metal.name}`}
                    title="Delete metal (only if unused)"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <ActiveBadge isActive={metal.isActive} />
              )}
            </div>
          ),
        )}

        {canEdit ? (
          showAdd ? (
            <MetalFormRow onDone={() => setShowAdd(false)} />
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="gap-2"
                onClick={() => setShowAdd(true)}
              >
                <Plus className="h-4 w-4" />
                Add Metal
              </Button>
              <MetalCategoryImportDialog />
            </div>
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
  const [primaryUnit, setPrimaryUnit] = useState(metal?.primaryUnit ?? "GRAM");

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

      <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
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

      <div className="space-y-1.5">
        <Label htmlFor="metal-primaryUnit">Primary Unit</Label>
        <input type="hidden" name="primaryUnit" value={primaryUnit} />
        <Select value={primaryUnit} onValueChange={(value) => setPrimaryUnit(value as "GRAM" | "CARAT")}>
          <SelectTrigger id="metal-primaryUnit" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GRAM">Gram</SelectItem>
            <SelectItem value="CARAT">Carat</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end gap-2 pb-0.5">
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader className="h-4 w-4" /> : metal ? "Update" : "Save"}
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
                <Badge variant="outline">
                  {stone.primaryUnit === "CARAT" ? "Carat" : "Gram"}
                </Badge>
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
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-blue-50 text-blue-700 transition hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/60"
                    aria-label={`Edit ${stone.name}`}
                    title="Edit stone"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(stone.id, stone.name)}
                    disabled={deletingId === stone.id}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-destructive text-destructive-foreground transition hover:bg-destructive/90 disabled:opacity-50"
                    aria-label={`Delete ${stone.name}`}
                    title="Delete stone (only if unused)"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <ActiveBadge isActive={stone.isActive} />
              )}
            </div>
          ),
        )}

        {canEdit ? (
          showAdd ? (
            <StoneFormRow onDone={() => setShowAdd(false)} />
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="gap-2"
                onClick={() => setShowAdd(true)}
              >
                <Plus className="h-4 w-4" />
                Add Stone
              </Button>
              <StoneTypeImportDialog />
            </div>
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
  // Defaults to Carat for a new stone — every gemstone in this trade is
  // conventionally valued/weighed per carat, unlike Metals which default Gram.
  const [primaryUnit, setPrimaryUnit] = useState(stone?.primaryUnit ?? "CARAT");

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
      <input type="hidden" name="primaryUnit" value={primaryUnit} />

      <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
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

      <div className="space-y-1.5">
        <Label htmlFor="stone-primaryUnit">Primary Unit</Label>
        <Select value={primaryUnit} onValueChange={(value) => setPrimaryUnit(value as "GRAM" | "CARAT")}>
          <SelectTrigger id="stone-primaryUnit" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GRAM">Gram</SelectItem>
            <SelectItem value="CARAT">Carat</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end gap-2 pb-0.5">
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader className="h-4 w-4" /> : stone ? "Update" : "Save"}
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
        <div className="max-w-xs space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
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
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-blue-50 text-blue-700 transition hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/60"
                        aria-label={`Edit ${option.name}`}
                        title="Edit Stone Type"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(option.id, option.name)}
                        disabled={deletingId === option.id}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-destructive text-destructive-foreground transition hover:bg-destructive/90 disabled:opacity-50"
                        aria-label={`Delete ${option.name}`}
                        title="Delete Stone Type (only if unused)"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <ActiveBadge isActive={option.isActive} />
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

      <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
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

      <div className="w-32 space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
        <Label htmlFor="stone-type-carat" required>Grams / Carat</Label>
        <Input
          id="stone-type-carat"
          name="gramsPerCarat"
          type="number"
          step="0.0001"
          min="0"
          defaultValue={option?.gramsPerCarat ?? 0.2}
          required
        />
        {state.errors?.gramsPerCarat?.[0] ? (
          <p className="text-sm text-red-600">{state.errors.gramsPerCarat[0]}</p>
        ) : null}
      </div>

      <div className="w-36 space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
        <Label htmlFor="stone-type-rate">Selling Price</Label>
        <Input
          id="stone-type-rate"
          name="sellingPrice"
          type="number"
          step="0.01"
          min="0"
          defaultValue={option?.sellingPrice ?? ""}
          placeholder="Optional"
        />
      </div>

      <div className="flex justify-end gap-2 pb-0.5">
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader className="h-4 w-4" /> : option ? "Update" : "Save"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Purities — real per-Metal Purity options (Gold -> 18K/20K/22K/24K, etc),
// replacing the old global PurityType enum. Mirrors Stone Types above
// exactly, just scoped to a hasPurity Metal instead of a gemstone.
// ---------------------------------------------------------------------------

function PuritiesSection({
  metals,
  canEdit,
}: {
  metals: StoreMetalRow[];
  canEdit: boolean;
}) {
  const toast = useToast();

  const [selectedMetalId, setSelectedMetalId] = useState("");
  const [purities, setPurities] = useState<StoreMetalPurityRow[]>([]);
  const [loadingPurities, setLoadingPurities] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const purityEligibleMetals = metals.filter((metal) => metal.hasPurity);

  const reloadPurities = React.useCallback(async (storeMetalId: string) => {
    if (!storeMetalId) {
      setPurities([]);
      return;
    }

    try {
      const data = await getStoreMetalPurities(storeMetalId);
      setPurities(data);
    } catch (error) {
      console.error("Failed to reload purities:", error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPurities() {
      if (!selectedMetalId) {
        setPurities([]);
        return;
      }

      try {
        setLoadingPurities(true);
        const data = await getStoreMetalPurities(selectedMetalId);
        if (!cancelled) setPurities(data);
      } catch (error) {
        console.error("Failed to load purities:", error);
        if (!cancelled) setPurities([]);
      } finally {
        if (!cancelled) setLoadingPurities(false);
      }
    }

    setEditingId(null);
    setShowAdd(false);
    loadPurities();

    return () => {
      cancelled = true;
    };
  }, [selectedMetalId]);

  async function handleToggle(id: string, isActive: boolean) {
    try {
      setTogglingId(id);
      const result = await toggleStoreMetalPurityActive(id, isActive);
      if (result.success) {
        toast.success(result.message);
        await reloadPurities(selectedMetalId);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to update purity");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string, label: string) {
    if (!window.confirm(`Delete "${label}"? This can't be undone — it only works if nothing uses it yet.`)) return
    try {
      setDeletingId(id);
      const result = await deleteStoreMetalPurity(id);
      if (result.success) {
        toast.success(result.message);
        await reloadPurities(selectedMetalId);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete purity");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Purities</CardTitle>
        <p className="text-sm text-muted-foreground">
          Purity options scoped under a metal, e.g. 18K/20K/22K/24K under
          Gold — add as many as your store deals in. Replaces the old
          Settings &gt; Purity page.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-xs space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Metal</Label>
          <Select value={selectedMetalId} onValueChange={setSelectedMetalId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a metal" />
            </SelectTrigger>
            <SelectContent>
              {purityEligibleMetals.map((metal) => (
                <SelectItem key={metal.id} value={metal.id}>
                  {metal.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!selectedMetalId ? (
          <p className="text-sm text-muted-foreground">
            Select a metal to manage its Purities.
          </p>
        ) : loadingPurities ? (
          <p className="text-sm text-muted-foreground">Loading purities...</p>
        ) : (
          <div className="space-y-3">
            {purities.length === 0 && !showAdd ? (
              <p className="text-sm text-muted-foreground">
                No purities configured for this metal yet.
              </p>
            ) : null}

            {purities.map((option) =>
              editingId === option.id ? (
                <PurityFormRow
                  key={option.id}
                  option={option}
                  storeMetalId={selectedMetalId}
                  onDone={() => setEditingId(null)}
                  onSaved={() => reloadPurities(selectedMetalId)}
                />
              ) : (
                <div
                  key={option.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <div className={option.isActive ? "" : "text-muted-foreground line-through"}>
                    <span className="font-medium">{option.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      SKU "{option.skuCode}" &middot; {option.finenessPercent}% fine
                      {option.sellingPrice != null ? ` · ₹${option.sellingPrice}` : ""}
                      {option.isHallmarkable ? " · Hallmarkable" : ""}
                    </span>
                  </div>

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
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-blue-50 text-blue-700 transition hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/60"
                        aria-label={`Edit ${option.label}`}
                        title="Edit Purity"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(option.id, option.label)}
                        disabled={deletingId === option.id}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-destructive text-destructive-foreground transition hover:bg-destructive/90 disabled:opacity-50"
                        aria-label={`Delete ${option.label}`}
                        title="Delete Purity (only if unused)"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <ActiveBadge isActive={option.isActive} />
                  )}
                </div>
              ),
            )}

            {canEdit ? (
              showAdd ? (
                <PurityFormRow
                  storeMetalId={selectedMetalId}
                  onDone={() => setShowAdd(false)}
                  onSaved={() => reloadPurities(selectedMetalId)}
                />
              ) : (
                <Button type="button" className="gap-2" onClick={() => setShowAdd(true)}>
                  <Plus className="h-4 w-4" />
                  Add Purity
                </Button>
              )
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PurityFormRow({
  option,
  storeMetalId,
  onDone,
  onSaved,
}: {
  option?: StoreMetalPurityRow;
  storeMetalId: string;
  onDone: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [state, formAction, pending] = useActionState(upsertStoreMetalPurity, initialState);
  const [isHallmarkable, setIsHallmarkable] = useState(option?.isHallmarkable ?? false);

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
        event.preventDefault()
        formAction(new FormData(event.currentTarget))
      }}
      className="flex flex-wrap items-end gap-3 rounded-md border border-dashed p-3"
    >
      <input type="hidden" name="id" value={option?.id ?? ""} />
      <input type="hidden" name="storeMetalId" value={storeMetalId} />
      <input type="hidden" name="isHallmarkable" value={isHallmarkable ? "true" : "false"} />

      <div className="w-28 space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
        <Label htmlFor="purity-label" required>Label</Label>
        <Input
          id="purity-label"
          name="label"
          defaultValue={option?.label ?? ""}
          placeholder="e.g. 22K"
          required
        />
        {state.errors?.label?.[0] ? (
          <p className="text-sm text-red-600">{state.errors.label[0]}</p>
        ) : null}
      </div>

      <div className="w-24 space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
        <Label htmlFor="purity-sku" required>SKU Code</Label>
        <Input
          id="purity-sku"
          name="skuCode"
          defaultValue={option?.skuCode ?? ""}
          placeholder="e.g. 22"
          required
        />
        {state.errors?.skuCode?.[0] ? (
          <p className="text-sm text-red-600">{state.errors.skuCode[0]}</p>
        ) : null}
      </div>

      <div className="w-28 space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
        <Label htmlFor="purity-fineness" required>Fineness %</Label>
        <Input
          id="purity-fineness"
          name="finenessPercent"
          type="number"
          step="0.01"
          min="0"
          max="100"
          defaultValue={option?.finenessPercent ?? 100}
          required
        />
        {state.errors?.finenessPercent?.[0] ? (
          <p className="text-sm text-red-600">{state.errors.finenessPercent[0]}</p>
        ) : null}
      </div>

      <div className="w-32 space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
        <Label htmlFor="purity-rate">Selling Price</Label>
        <Input
          id="purity-rate"
          name="sellingPrice"
          type="number"
          step="0.01"
          min="0"
          defaultValue={option?.sellingPrice ?? ""}
          placeholder="Optional"
        />
      </div>

      <label className="flex items-center gap-2 pb-2 text-sm">
        <input
          type="checkbox"
          checked={isHallmarkable}
          onChange={(event) => setIsHallmarkable(event.target.checked)}
          className="h-4 w-4 rounded border-input"
        />
        Hallmarkable
      </label>

      <div className="flex justify-end gap-2 pb-0.5">
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader className="h-4 w-4" /> : option ? "Update" : "Save"}
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
  metals,
  canEdit,
}: {
  categories: StoreCategoryRow[];
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
            <div key={category.id} className="space-y-2 rounded-md border px-3 py-2">
              <div className="flex items-center justify-between gap-3">
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
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-blue-50 text-blue-700 transition hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/60"
                      aria-label={`Edit ${category.name}`}
                      title="Edit category"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(category.id, category.name)}
                      disabled={deletingId === category.id}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-destructive text-destructive-foreground transition hover:bg-destructive/90 disabled:opacity-50"
                      aria-label={`Delete ${category.name}`}
                      title="Delete category (only if unused)"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <ActiveBadge isActive={category.isActive} />
                )}
              </div>

              <CategoryMetalTags category={category} metals={metals} canEdit={canEdit} />
            </div>
          ),
        )}

        {canEdit ? (
          showAdd ? (
            <CategoryFormRow onDone={() => setShowAdd(false)} />
          ) : (
            <Button
              type="button"
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

      <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
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

      <div className="flex justify-end gap-2 pb-0.5">
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader className="h-4 w-4" /> : category ? "Update" : "Save"}
        </Button>
      </div>
    </form>
  );
}

/**
 * "Applicable Metals" — which Metals/Stones this category is restricted to.
 * No tags checked at all means universal (shown for every metal, matching
 * every category's behavior before this existed) — see
 * StoreCategory.metalTags' own doc comment in schema.prisma.
 */
function CategoryMetalTags({
  category,
  metals,
  canEdit,
}: {
  category: StoreCategoryRow;
  metals: StoreMetalRow[];
  canEdit: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [tagIds, setTagIds] = useState<string[]>(category.metalTagIds);
  const [saving, setSaving] = useState(false);

  async function toggleTag(storeMetalId: string, checked: boolean) {
    const next = checked ? [...tagIds, storeMetalId] : tagIds.filter((id) => id !== storeMetalId);
    setTagIds(next);
    setSaving(true);
    try {
      const result = await updateStoreCategoryMetalTags(category.id, next);
      if (result.success) {
        router.refresh();
      } else {
        toast.error(result.message);
        setTagIds(tagIds);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to update applicable metals");
      setTagIds(tagIds);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-0.5 text-xs text-muted-foreground">
      <span className="font-medium">Applicable to:</span>
      {tagIds.length === 0 && !canEdit ? <span>All metals</span> : null}
      {metals.map((metal) => (
        <label key={metal.id} className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={tagIds.includes(metal.id)}
            disabled={!canEdit || saving}
            onChange={(event) => toggleTag(metal.id, event.target.checked)}
            className="h-3.5 w-3.5 rounded border-input"
          />
          {metal.name}
        </label>
      ))}
      {tagIds.length === 0 && canEdit ? (
        <span className="italic">(none checked = all metals)</span>
      ) : null}
    </div>
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
        <div className="max-w-xs space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
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
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-blue-50 text-blue-700 transition hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/60"
                        aria-label={`Edit ${type.name}`}
                        title="Edit type"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(type.id, type.name)}
                        disabled={deletingId === type.id}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-destructive text-destructive-foreground transition hover:bg-destructive/90 disabled:opacity-50"
                        aria-label={`Delete ${type.name}`}
                        title="Delete type (only if unused)"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <ActiveBadge isActive={type.isActive} />
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

      <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
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

      <div className="flex justify-end gap-2 pb-0.5">
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader className="h-4 w-4" /> : type ? "Update" : "Save"}
        </Button>
      </div>
    </form>
  );
}
