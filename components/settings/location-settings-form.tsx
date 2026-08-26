"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Loader2 } from "lucide-react";

import {
  upsertStoreLocation,
  toggleStoreLocationActive,
  type StoreLocationRow,
  type LocationFormState,
} from "@/lib/actions/store-location-actions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/providers/toast-provider";

const initialState: LocationFormState = { success: false, message: "" };

type LocationSettingsFormProps = {
  locations: StoreLocationRow[];
  canEdit: boolean;
};

export function LocationSettingsForm({ locations, canEdit }: LocationSettingsFormProps) {
  const router = useRouter();
  const toast = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function handleToggle(id: string, isActive: boolean) {
    try {
      setTogglingId(id);
      const result = await toggleStoreLocationActive(id, isActive);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to update location");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Locations</CardTitle>
        <p className="text-sm text-muted-foreground">
          The physical locations (warehouses, lockers, trays, branches) your
          store keeps stock in — used wherever a stock item&apos;s location is
          recorded.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {locations.length === 0 && !showAdd ? (
          <p className="text-sm text-muted-foreground">No locations configured yet.</p>
        ) : null}

        {locations.map((location) =>
          editingId === location.id ? (
            <LocationFormRow
              key={location.id}
              location={location}
              onDone={() => setEditingId(null)}
            />
          ) : (
            <div
              key={location.id}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
            >
              <span className={location.isActive ? "" : "text-muted-foreground line-through"}>
                {location.name}
              </span>

              {canEdit ? (
                <div className="flex items-center gap-3">
                  <Switch
                    checked={location.isActive}
                    disabled={togglingId === location.id}
                    onCheckedChange={(checked) => handleToggle(location.id, checked)}
                  />
                  <button
                    type="button"
                    onClick={() => setEditingId(location.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-muted"
                    aria-label={`Edit ${location.name}`}
                    title="Edit location"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <Badge variant={location.isActive ? "outline" : "secondary"}>
                  {location.isActive ? "Active" : "Inactive"}
                </Badge>
              )}
            </div>
          ),
        )}

        {canEdit ? (
          showAdd ? (
            <LocationFormRow onDone={() => setShowAdd(false)} />
          ) : (
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => setShowAdd(true)}
            >
              <Plus className="h-4 w-4" />
              Add Location
            </Button>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

function LocationFormRow({
  location,
  onDone,
}: {
  location?: StoreLocationRow;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState(upsertStoreLocation, initialState);

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
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-md border border-dashed p-3"
    >
      <input type="hidden" name="id" value={location?.id ?? ""} />

      <div className="space-y-1.5">
        <Label htmlFor="location-name">Name</Label>
        <Input
          id="location-name"
          name="name"
          defaultValue={location?.name ?? ""}
          placeholder="e.g. Main Vault"
          required
        />
        {state.errors?.name?.[0] ? (
          <p className="text-sm text-red-600">{state.errors.name[0]}</p>
        ) : null}
      </div>

      <div className="flex gap-2 pb-0.5">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
