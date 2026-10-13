import "server-only";

import { InventoryStockStatus, InventoryTransactionType, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { OversellError } from "@/lib/inventory/oversell-error";
import {
  LOT_EPSILON,
  LOT_WEIGHT_FIELDS,
  addLotWeights,
  stockSellsByWeight,
  lotMeasure,
  lotDrawJson,
  planLotDraw,
  subtractLotWeights,
  toLotWeights,
  type LotDraw,
  type LotWeights,
} from "@/lib/inventory/weight-lot";

// Server side of sold-by-weight lots (see lib/inventory/weight-lot.ts).
// Every sale path (Invoice create/update, Estimate, Quotation → Invoice)
// draws through drawFromLot, every restore path (invoice cancel / delete /
// edit, credit-note return) gives back through restoreToLot, and both write
// the InventoryTransaction row (byWeight, exact weights moved).

const lotWeightSelect = {
  grossWeight: true,
  netWeight: true,
  fineWeight: true,
  caratWeight: true,
  stoneWeight: true,
} as const;

export type LotRow = {
  id: string;
  stockCode: string;
  label: string;
  status: InventoryStockStatus;
  weights: LotWeights;
};

/**
 * The rows among `stockIds` (this store's) that sell by weight — keyed by id.
 * Rows that don't (not flagged, more than one piece, multi-part) are absent.
 */
export async function loadWeightLots(storeId: string, stockIds: Iterable<string>): Promise<Map<string, LotRow>> {
  const ids = [...new Set(stockIds)];
  if (ids.length === 0) return new Map();
  const rows = await prisma.inventoryStock.findMany({
    where: { id: { in: ids }, storeId, product: { soldByWeight: true } },
    select: {
      id: true,
      stockCode: true,
      quantity: true,
      status: true,
      ...lotWeightSelect,
      product: {
        select: {
          name: true,
          soldByWeight: true,
          _count: { select: { metalComponents: true, stoneComponents: true } },
        },
      },
      _count: { select: { components: true } },
    },
  });
  const lots = new Map<string, LotRow>();
  for (const row of rows) {
    const sellsByWeight = stockSellsByWeight({
      quantity: row.quantity,
      components: row._count.components,
      product: {
        soldByWeight: row.product.soldByWeight,
        metalComponents: row.product._count.metalComponents,
        stoneComponents: row.product._count.stoneComponents,
      },
    });
    if (!sellsByWeight) continue;
    lots.set(row.id, {
      id: row.id,
      stockCode: row.stockCode,
      label: `${row.product.name} (${row.stockCode})`,
      status: row.status,
      weights: toLotWeights(row),
    });
  }
  return lots;
}

type LotLine = {
  itemName?: string | null;
  inventoryStockId?: string | null;
  quantity: number;
  grossWeight?: number | null;
  netWeight?: number | null;
  caratWeight?: number | null;
  stoneWeight?: number | null;
  multiPart?: boolean | null;
  lotDraw?: LotDraw | null;
};

/**
 * Plans every line's draw before the save, against what's left of each lot
 * (plus `held` — weight this same document already took and will give back
 * first, on an edit). The amount sold is the line's own weight in the lot's
 * measure (net g, or carats for a stone parcel), as typed on the form; the
 * other weights follow in proportion. Lines on the same lot share it.
 *
 * Sets `lotDraw` on EVERY line (null when it isn't a lot line — a client
 * can't smuggle one in), forces quantity 1 and overwrites the line's
 * weights with exactly what is drawn. Call before lockLinkedStockFields,
 * which leaves a lot line's weights alone.
 */
export async function planLineLotDraws<T extends LotLine>(
  storeId: string,
  items: T[],
  held: ReadonlyMap<string, LotWeights> = new Map(),
): Promise<{ items: T[] } | { error: string }> {
  const lots = await loadWeightLots(
    storeId,
    items.map((item) => item.inventoryStockId).filter((id): id is string => Boolean(id)),
  );
  const remaining = new Map<string, LotWeights>();
  const out: T[] = [];
  for (const item of items) {
    const lot = item.inventoryStockId ? lots.get(item.inventoryStockId) : undefined;
    if (!lot || item.multiPart) {
      out.push({ ...item, lotDraw: null });
      continue;
    }
    const left =
      remaining.get(lot.id) ??
      (held.has(lot.id) ? addLotWeights(lot.weights, held.get(lot.id)!) : lot.weights);
    const measure = lotMeasure(left) ?? "netWeight";
    const requested = Number(item[measure] ?? 0);
    const plan = planLotDraw(left, requested, lot.label);
    if (!plan.ok) return { error: plan.error };
    remaining.set(lot.id, subtractLotWeights(left, plan.draw));
    const { draw } = plan;
    out.push({
      ...item,
      quantity: 1,
      grossWeight: draw.grossWeight || null,
      netWeight: draw.netWeight || null,
      caratWeight: draw.caratWeight || null,
      stoneWeight: draw.stoneWeight || null,
      lotDraw: draw,
    });
  }
  return { items: out };
}

/** What every lot line of an existing document took, summed per stock row. */
export function heldLotWeights(
  lines: { inventoryStockId: string | null; lotDraw: unknown }[],
  parse: (value: unknown) => LotDraw | null,
): Map<string, LotWeights> {
  const held = new Map<string, LotWeights>();
  for (const line of lines) {
    const draw = parse(line.lotDraw);
    if (!line.inventoryStockId || !draw) continue;
    const prev = held.get(line.inventoryStockId);
    held.set(line.inventoryStockId, prev ? addLotWeights(prev, draw) : toLotWeights(draw));
  }
  return held;
}

/**
 * Takes `draw` off the lot inside the sale's transaction. The update is
 * conditional on every drawn weight still being there (and the row on hand),
 * so two concurrent sales can never take more than the lot holds — the
 * loser gets count 0 and the whole sale rolls back. The row turns SOLD
 * (quantity 0) only when its measure reaches zero.
 */
export async function drawFromLot(
  tx: Prisma.TransactionClient,
  input: {
    storeId: string;
    stockId: string;
    draw: LotDraw;
    label: string;
    referenceType: string;
    referenceId: string;
  },
) {
  const { storeId, stockId, draw } = input;
  const guards: Record<string, { gte: number }> = {};
  const data: Record<string, { decrement: number }> = {};
  for (const field of LOT_WEIGHT_FIELDS) {
    if (draw[field] > 0) {
      guards[field] = { gte: draw[field] };
      data[field] = { decrement: draw[field] };
    }
  }
  const { count } = await tx.inventoryStock.updateMany({
    where: {
      id: stockId,
      storeId,
      status: InventoryStockStatus.IN_STOCK,
      quantity: { gte: 1 },
      ...guards,
    },
    data,
  });
  if (count === 0) {
    throw new OversellError(
      `Not enough weight left of ${input.label || "an item"} — part of it may have just been sold in another sale. Refresh and try again.`,
    );
  }

  const left = await tx.inventoryStock.findUniqueOrThrow({ where: { id: stockId }, select: lotWeightSelect });
  const emptied = !(toLotWeights(left)[draw.measure] > LOT_EPSILON);
  if (emptied) {
    await tx.inventoryStock.update({
      where: { id: stockId },
      data: { quantity: 0, status: InventoryStockStatus.SOLD },
    });
  }

  await tx.inventoryTransaction.create({
    data: {
      inventoryStockId: stockId,
      transactionType: InventoryTransactionType.SALE,
      byWeight: true,
      quantity: emptied ? 1 : 0,
      grossWeight: draw.grossWeight || undefined,
      netWeight: draw.netWeight || undefined,
      caratWeight: draw.caratWeight || undefined,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
    },
  });
}

/**
 * Gives back exactly what a line drew (its stored `lotDraw`). A lot that had
 * been sold out comes back IN_STOCK with quantity 1.
 */
export async function restoreToLot(
  tx: Prisma.TransactionClient,
  input: {
    storeId: string;
    stockId: string;
    draw: LotDraw;
    referenceType: string;
    referenceId: string;
    notes: string;
  },
) {
  const { storeId, stockId, draw } = input;
  const data: Record<string, { increment: number }> = {};
  for (const field of LOT_WEIGHT_FIELDS) {
    if (draw[field] > 0) data[field] = { increment: draw[field] };
  }
  if (Object.keys(data).length) {
    await tx.inventoryStock.updateMany({ where: { id: stockId, storeId }, data });
  }

  const row = await tx.inventoryStock.findFirst({
    where: { id: stockId, storeId },
    select: { quantity: true, status: true, ...lotWeightSelect },
  });
  if (!row) return;
  const refilled = row.quantity < 1 && toLotWeights(row)[draw.measure] > LOT_EPSILON;
  if (refilled) {
    await tx.inventoryStock.update({
      where: { id: stockId },
      data: {
        quantity: 1,
        ...(row.status === InventoryStockStatus.SOLD ? { status: InventoryStockStatus.IN_STOCK } : {}),
      },
    });
  }

  await tx.inventoryTransaction.create({
    data: {
      inventoryStockId: stockId,
      transactionType: InventoryTransactionType.SALE_RETURN,
      byWeight: true,
      quantity: refilled ? 1 : 0,
      grossWeight: draw.grossWeight || undefined,
      netWeight: draw.netWeight || undefined,
      caratWeight: draw.caratWeight || undefined,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      notes: input.notes,
    },
  });
}

export { lotDrawJson };
