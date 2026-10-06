import "server-only";

import type { Prisma, WeightUnit } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * One editable selling rate in the header's Today's Rates popover. Each
 * maps onto the exact column Settings > Taxonomy edits, so the header and
 * Settings can never disagree:
 *   purity    -> StoreMetalPurity.sellingPrice  (Gold 22K, Silver 925, ...)
 *   stoneType -> StoreMetalOrigin.sellingPrice  (Diamond Natural, ...)
 *   metal     -> StoreMetal.sellingPrice        (a metal/stone with no
 *                purities or stone types, e.g. "Other")
 */
export type SellingRateKind = "metal" | "purity" | "stoneType";

export type SellingRateRow = {
  kind: SellingRateKind;
  id: string;
  label: string;
  price: number | null;
};

export type SellingRateGroup = {
  metalId: string;
  metalName: string;
  /** "g" or "ct" — what the price is per. */
  unit: string;
  isGemstone: boolean;
  /** A purity (Has Purity metal) or stone type (gemstone) can be added. */
  canAddOption: boolean;
  rows: SellingRateRow[];
};

const num = (value: { toString(): string } | null) => (value != null ? Number(value) : null);

/**
 * Plain helper (not a server action) so the storeId can't be supplied by a
 * client — only the dashboard layout calls it, with the session's own store.
 */
export async function getSellingRateGroups(storeId: string): Promise<SellingRateGroup[]> {
  const metals = await prisma.storeMetal.findMany({
    where: { storeId, isActive: true },
    orderBy: [{ isGemstone: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      isGemstone: true,
      hasPurity: true,
      primaryUnit: true,
      sellingPrice: true,
      purities: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
        select: { id: true, label: true, sellingPrice: true },
      },
      origins: {
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, sellingPrice: true },
      },
    },
  });

  return metals.map((metal) => {
    const unit = metal.primaryUnit === "CARAT" ? "ct" : "g";
    let rows: SellingRateRow[];

    if (metal.isGemstone && metal.origins.length > 0) {
      rows = metal.origins.map((o) => ({
        kind: "stoneType" as const,
        id: o.id,
        label: `${metal.name} ${o.name}`,
        price: num(o.sellingPrice),
      }));
    } else if (!metal.isGemstone && metal.hasPurity && metal.purities.length > 0) {
      rows = metal.purities.map((p) => ({
        kind: "purity" as const,
        id: p.id,
        label: `${metal.name} ${p.label}`,
        price: num(p.sellingPrice),
      }));
    } else {
      rows = [{ kind: "metal", id: metal.id, label: metal.name, price: num(metal.sellingPrice) }];
    }

    return {
      metalId: metal.id,
      metalName: metal.name,
      unit,
      isGemstone: metal.isGemstone,
      canAddOption: metal.isGemstone || metal.hasPurity,
      rows,
    };
  });
}

type Tx = Prisma.TransactionClient;

/**
 * The rate as it stands now, with the label/unit a history row snapshots.
 * Null when the id isn't this store's.
 */
export async function describeSellingRate(
  tx: Tx,
  storeId: string,
  kind: SellingRateKind,
  id: string,
): Promise<{ label: string; unit: string; price: number | null } | null> {
  const unitOf = (u: WeightUnit) => (u === "CARAT" ? "ct" : "g");

  if (kind === "purity") {
    const row = await tx.storeMetalPurity.findFirst({
      where: { id, storeId },
      select: { label: true, sellingPrice: true, storeMetal: { select: { name: true, primaryUnit: true } } },
    });
    return row
      ? { label: `${row.storeMetal.name} ${row.label}`, unit: unitOf(row.storeMetal.primaryUnit), price: num(row.sellingPrice) }
      : null;
  }
  if (kind === "stoneType") {
    const row = await tx.storeMetalOrigin.findFirst({
      where: { id, storeId },
      select: { name: true, sellingPrice: true, storeMetal: { select: { name: true, primaryUnit: true } } },
    });
    return row
      ? { label: `${row.storeMetal.name} ${row.name}`, unit: unitOf(row.storeMetal.primaryUnit), price: num(row.sellingPrice) }
      : null;
  }
  const row = await tx.storeMetal.findFirst({
    where: { id, storeId },
    select: { name: true, sellingPrice: true, primaryUnit: true },
  });
  return row ? { label: row.name, unit: unitOf(row.primaryUnit), price: num(row.sellingPrice) } : null;
}

/**
 * Appends a SellingRateEntry when a rate actually changed. Call it in the
 * same transaction as the update, after it, with the value read before it.
 */
export async function recordSellingRateChange(
  tx: Tx,
  args: {
    storeId: string;
    kind: SellingRateKind;
    refId: string;
    before: number | null;
    after: number | null;
    changedById: string | null;
  },
) {
  if (args.before === args.after) return;
  const now = await describeSellingRate(tx, args.storeId, args.kind, args.refId);
  if (!now) return;
  await tx.sellingRateEntry.create({
    data: {
      storeId: args.storeId,
      kind: args.kind,
      refId: args.refId,
      label: now.label,
      unit: now.unit,
      sellingPrice: args.after,
      changedById: args.changedById,
    },
  });
}

export type SellingRateHistoryRow = {
  id: string;
  date: string;
  label: string;
  unit: string;
  price: number | null;
  changedBy: string | null;
};

/** Newest first, for the Metal Rates page. */
export async function getSellingRateHistory(storeId: string, take = 200): Promise<SellingRateHistoryRow[]> {
  const rows = await prisma.sellingRateEntry.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    take,
  });
  const userIds = [...new Set(rows.map((r) => r.changedById).filter((x): x is string => !!x))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id,
    date: r.createdAt.toISOString(),
    label: r.label,
    unit: r.unit,
    price: num(r.sellingPrice),
    changedBy: r.changedById ? names.get(r.changedById) ?? null : null,
  }));
}

export type SellingRateLastUpdate = { at: string; by: string | null } | null;

/** When the store's selling rates last changed, and who changed them. */
export async function getLastSellingRateUpdate(storeId: string): Promise<SellingRateLastUpdate> {
  const last = await prisma.sellingRateEntry.findFirst({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, changedById: true },
  });
  if (!last) return null;
  const user = last.changedById
    ? await prisma.user.findUnique({ where: { id: last.changedById }, select: { name: true } })
    : null;
  return { at: last.createdAt.toISOString(), by: user?.name ?? null };
}
