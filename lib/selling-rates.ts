import "server-only";

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

    return { metalId: metal.id, metalName: metal.name, unit, isGemstone: metal.isGemstone, rows };
  });
}
