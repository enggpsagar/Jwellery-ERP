"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Coins, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/components/providers/toast-provider";
import {
  addSellingRateOption,
  addStandardSellingRates,
  updateSellingRates,
  type SellingRateUpdate,
} from "@/lib/actions/selling-rate-actions";
import type { SellingRateGroup, SellingRateLastUpdate } from "@/lib/selling-rates";

type RatesChipProps = {
  groups: SellingRateGroup[];
  /** Store Owner (Admin/Super Admin in the active store). Others read only. */
  canEdit: boolean;
  lastUpdate?: SellingRateLastUpdate;
};

const inr = (value: number) =>
  `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const keyOf = (kind: string, id: string) => `${kind}:${id}`;

function updatedLabel(last: NonNullable<SellingRateLastUpdate>) {
  const at = new Date(last.at);
  const sameDay = at.toDateString() === new Date().toDateString();
  const when = at.toLocaleString("en-IN", {
    ...(sameDay ? {} : { day: "numeric", month: "short" }),
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Last updated ${sameDay ? "today " : ""}${when}${last.by ? ` by ${last.by}` : ""}`;
}

/**
 * Header "Today's Rates": the store's selling rates one click away instead
 * of Settings > Taxonomy. Edits write the same columns Settings does
 * (lib/actions/selling-rate-actions.ts), so billing uses them immediately,
 * and every change is kept as history (Metal Rates → Your Selling Rates).
 */
export function RatesChip({ groups, canEdit, lastUpdate = null }: RatesChipProps) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // Which metal's "+ Add" row is open, and what's typed in it.
  const [adding, setAdding] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newPrice, setNewPrice] = useState("");

  const initial = useMemo(() => {
    const map: Record<string, string> = {};
    for (const g of groups) {
      for (const r of g.rows) map[keyOf(r.kind, r.id)] = r.price != null ? String(r.price) : "";
    }
    return map;
  }, [groups]);

  const [drafts, setDrafts] = useState(initial);
  // Fresh server values replace the drafts while closed; while open (e.g.
  // after "+ Add"), only rows that weren't there before are filled in, so
  // rates the owner is still typing aren't wiped.
  useEffect(() => {
    if (!open) setDrafts(initial);
    else setDrafts((d) => ({ ...initial, ...Object.fromEntries(Object.entries(d).filter(([k]) => k in initial)) }));
  }, [initial, open]);

  // The chip shows the first priced rate of each of the first three metals
  // (Settings order: metals before stones, then by name).
  const summary = useMemo(
    () =>
      groups
        .map((g) => {
          const row = g.rows.find((r) => r.price != null);
          return row ? { label: row.label, price: row.price as number } : null;
        })
        .filter((x): x is { label: string; price: number } => x !== null)
        .slice(0, 3),
    [groups],
  );

  if (groups.length === 0) return null;

  const changed = Object.keys(drafts).filter(
    (k) => k in initial && (drafts[k] ?? "").trim() !== (initial[k] ?? "").trim(),
  );

  function parsePrice(raw: string): number | null | undefined {
    const t = raw.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  }

  function save() {
    const updates: SellingRateUpdate[] = [];
    for (const k of changed) {
      const [kind, id] = k.split(":") as ["metal" | "purity" | "stoneType", string];
      const price = parsePrice(drafts[k]);
      if (price === undefined) {
        toast.error("Rates must be a positive amount.");
        return;
      }
      updates.push({ kind, id, price });
    }

    startTransition(async () => {
      const result = await updateSellingRates(updates);
      if (result.success) {
        toast.success(result.message);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function addStandard() {
    startTransition(async () => {
      const result = await addStandardSellingRates();
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function addOption(metalId: string) {
    const price = parsePrice(newPrice);
    if (price === undefined) {
      toast.error("Rates must be a positive amount.");
      return;
    }
    startTransition(async () => {
      const result = await addSellingRateOption({ metalId, label: newLabel, price });
      if (result.success) {
        toast.success(result.message);
        setAdding(null);
        setNewLabel("");
        setNewPrice("");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setAdding(null);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 min-w-0 items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--chart-2)_35%,transparent)] bg-[color-mix(in_oklab,var(--chart-2)_8%,transparent)] px-3 text-sm transition-colors hover:bg-[color-mix(in_oklab,var(--chart-2)_15%,transparent)]"
          aria-label="Today's selling rates"
        >
          <Coins className="h-4 w-4 shrink-0 text-[var(--chart-2)]" />
          {summary.length === 0 ? (
            <span className="hidden text-muted-foreground md:inline">Set today&apos;s rates</span>
          ) : (
            <span className="hidden min-w-0 truncate md:inline">
              {summary.map((s, i) => (
                <span key={s.label}>
                  {i > 0 && <span className="mx-1.5 text-muted-foreground">·</span>}
                  <span className="text-muted-foreground">{s.label}</span>{" "}
                  <span className="font-medium tabular-nums">{inr(s.price)}</span>
                </span>
              ))}
            </span>
          )}
          <span className="md:hidden">Rates</span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[min(26rem,calc(100vw-2rem))] p-0">
        <div className="border-b px-4 py-3">
          <p className="font-medium">Today&apos;s selling rates</p>
          <p className="text-xs text-muted-foreground">
            {lastUpdate ? updatedLabel(lastUpdate) : "Not updated yet"}
            {" · "}
            {canEdit
              ? "used on new invoices, estimates and quotations."
              : "set by the Store Owner."}
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={addStandard}
              disabled={pending}
              className="mt-2 text-xs font-medium text-[var(--chart-1)] underline-offset-2 hover:underline disabled:opacity-50"
            >
              Add standard purities &amp; stone types (24K, 22K, 18K … Natural, Lab-Grown)
            </button>
          )}
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-4 py-3">
          {groups.map((g) => (
            <div key={g.metalId} className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {g.metalName} <span className="normal-case">(per {g.unit})</span>
              </p>
              {g.rows.map((r) => {
                const k = keyOf(r.kind, r.id);
                return (
                  <div key={k} className="flex items-center justify-between gap-3">
                    <label htmlFor={`rate-${k}`} className="min-w-0 truncate text-sm">
                      {r.label}
                    </label>
                    {canEdit ? (
                      <div className="relative w-32 shrink-0">
                        <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
                          ₹
                        </span>
                        <Input
                          id={`rate-${k}`}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          value={drafts[k] ?? ""}
                          onChange={(e) => setDrafts((d) => ({ ...d, [k]: e.target.value }))}
                          className="h-8 pl-6 text-right tabular-nums"
                          disabled={pending}
                        />
                      </div>
                    ) : (
                      <span className="text-sm font-medium tabular-nums">
                        {r.price != null ? inr(r.price) : "—"}
                      </span>
                    )}
                  </div>
                );
              })}

              {canEdit && g.canAddOption && (
                adding === g.metalId ? (
                  <div className="flex items-center gap-2 pt-1">
                    <Input
                      autoFocus
                      aria-label={`New ${g.isGemstone ? "stone type" : "purity"} for ${g.metalName}`}
                      placeholder={g.isGemstone ? "e.g. Lab-Grown" : "e.g. 23K"}
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addOption(g.metalId)}
                      className="h-8 min-w-0 flex-1"
                      disabled={pending}
                    />
                    <Input
                      aria-label={`Rate for the new ${g.metalName} entry`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      placeholder="₹ rate"
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addOption(g.metalId)}
                      className="h-8 w-24 text-right tabular-nums"
                      disabled={pending}
                    />
                    <Button size="sm" variant="outline" onClick={() => addOption(g.metalId)} disabled={pending}>
                      Add
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setAdding(g.metalId);
                      setNewLabel("");
                      setNewPrice("");
                    }}
                    className="inline-flex items-center gap-1 pt-0.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" />
                    Add {g.isGemstone ? "stone type" : "purity"}
                  </button>
                )
              )}
            </div>
          ))}
        </div>

        {canEdit && (
          <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
            <Link
              href="/metal-rates"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setOpen(false)}
            >
              Rate history
            </Link>
            <Button size="sm" onClick={save} disabled={pending || changed.length === 0}>
              {pending ? "Saving…" : changed.length > 0 ? `Save ${changed.length}` : "Save"}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
