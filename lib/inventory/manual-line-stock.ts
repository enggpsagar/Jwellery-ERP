// Product → Add Stock for a sale line typed by hand ("Create New Line
// Item" on the Invoice form), so the line can then be sold through the
// same validated, quantity-decrementing path as a line picked from stock.
//
// Before this, a manual invoice line was saved with no inventoryStockId at
// all — it never touched Product or InventoryStock, so nothing checked that
// the piece existed and nothing recorded it leaving the shop. Now every sold
// line is backed by a real stock row: picked lines use the one they picked,
// manual lines get one minted here.
//
// Not a "use server" file — it takes a transaction client and is only ever
// called from inside another server action's own $transaction.
import "server-only";

import {
  ChargeType,
  InventoryStockStatus,
  InventoryTransactionType,
  Prisma,
  type PurityType,
  type UserRole,
} from "@prisma/client";

import { buildSkuPrefix } from "@/lib/inventory/product-sku";

export type ManualSaleLine = {
  itemName: string;
  metalTypeId?: string | null;
  purity?: PurityType | null;
  purityLabel?: string | null;
  quantity: number;
  grossWeight?: number | null;
  netWeight?: number | null;
  caratWeight?: number | null;
  stoneWeight?: number | null;
  dmoWeight?: number | null;
  rate?: number | null;
  makingCharge: number;
  makingChargeType?: ChargeType | string | null;
  stoneCharge: number;
  stoneRate?: number | null;
  stoneMetalTypeName?: string | null;
  stoneTypeNames?: string | null;
  hsnCode?: string | null;
};

type Actor = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  role?: UserRole | null;
};

function toNumber(value: unknown) {
  const num = Number(value);
  return Number.isNaN(num) ? 0 : num;
}

function toDecimal(value: number | null | undefined) {
  return value === null || value === undefined ? undefined : new Prisma.Decimal(value);
}

/**
 * True for a unique-constraint violation on Product.productCode or
 * InventoryStock.stockCode — the only collision the sequential codes below
 * can produce (two sales minting the same "next" code at once). Callers
 * retry their whole transaction on this; see withManualStockCodeRetry.
 */
export function isManualStockCodeConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? "")];
  return fields.some((field) => field.includes("productCode") || field.includes("stockCode"));
}

/**
 * Re-runs `fn` (a whole $transaction) when a manual line's freshly minted
 * product/stock code collided with a concurrent sale's. A failed insert
 * aborts a Postgres transaction outright, so retrying the single insert
 * inside it isn't possible — the whole transaction is retried instead,
 * and every code is recomputed on the next attempt.
 */
export async function withManualStockCodeRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= attempts || !isManualStockCodeConflict(error)) throw error;
    }
  }
}

/** Same `{prefix}-NNN` sequencing as createProduct / Purchase's
 *  createProductFromManualEntry, read through `tx` so a second manual line
 *  in the same sale sees the first one's code. */
async function nextProductCode(tx: Prisma.TransactionClient, storeId: string, skuPrefix: string) {
  const existing = await tx.product.findMany({
    where: { storeId, productCode: { startsWith: `${skuPrefix}-` } },
    select: { productCode: true },
  });
  const pattern = new RegExp(`^${skuPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`);
  const highest = existing.reduce((max, row) => {
    const match = pattern.exec(row.productCode);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${skuPrefix}-${String(highest + 1).padStart(3, "0")}`;
}

/** Same STK-{year}-{0001} numbering and "highest existing wins" rule as
 *  getNextStockCode (lib/actions/inventory/stock-actions.ts). */
async function nextStockCode(tx: Prisma.TransactionClient, storeId: string) {
  const existing = await tx.inventoryStock.findMany({
    where: { storeId, stockCode: { startsWith: "STK-" } },
    select: { stockCode: true },
  });
  const highest = existing.reduce((max, row) => {
    const match = /^STK-(?:\d{4}-)?(\d+)$/.exec(row.stockCode);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `STK-${new Date().getFullYear()}-${String(highest + 1).padStart(4, "0")}`;
}

/**
 * Creates a real Product (named and seeded from the line) and an IN_STOCK
 * InventoryStock row holding exactly the line's quantity, and logs the
 * stock-in. Returns the new stock id — the caller links the line to it and
 * sells it through its normal decrement, which takes the row straight to 0
 * and SOLD. Cancelling/deleting the invoice later restores the pieces to
 * this row like any other sold stock.
 *
 * Deliberately writes no metal LedgerEntry (unlike the manual Add Stock
 * form's ADJUSTMENT debit): the piece arrives and leaves in the same sale,
 * and a stock-in debit with no matching metal credit on the sale side would
 * inflate the store's metal balance.
 */
export async function createStockForManualSaleLine(
  tx: Prisma.TransactionClient,
  params: {
    storeId: string;
    line: ManualSaleLine;
    actor: Actor;
    locationId?: string | null;
    referenceType: string;
  },
): Promise<string> {
  const { storeId, line, actor, locationId, referenceType } = params;

  const [businessSettings, metalRow] = await Promise.all([
    tx.businessSettings.findUnique({ where: { storeId }, select: { skuFormat: true } }),
    line.metalTypeId
      ? tx.storeMetal.findFirst({ where: { id: line.metalTypeId, storeId }, select: { id: true, name: true } })
      : Promise.resolve(null),
  ]);
  // A metal id from another store (or a stale one) is dropped, never
  // attached to this store's product/stock.
  const metalTypeId = metalRow?.id ?? null;

  const skuPrefix = buildSkuPrefix({
    metalName: metalRow?.name ?? "X",
    purity: line.purity ?? null,
    purityCode: null,
    targetStyleName: null,
    categoryTypeName: null,
    categoryName: null,
    format: businessSettings?.skuFormat,
  });

  const makingChargeType =
    line.makingChargeType === ChargeType.PERCENTAGE ? ChargeType.PERCENTAGE : ChargeType.FIXED;
  const quantity = Math.max(1, Math.trunc(toNumber(line.quantity)) || 1);
  const itemName = line.itemName?.trim() || "Manually Added Item";

  const product = await tx.product.create({
    select: { id: true },
    data: {
      storeId,
      productCode: await nextProductCode(tx, storeId, skuPrefix),
      name: itemName,
      metalTypeId: metalTypeId ?? undefined,
      defaultPurity: line.purity ?? undefined,
      defaultMakingCharge: line.makingCharge,
      defaultMakingChargeType: makingChargeType,
      defaultStoneCharge: line.stoneCharge,
      defaultStoneRate: line.stoneRate ?? undefined,
      defaultGrossWeight: line.grossWeight ?? undefined,
      defaultNetWeight: line.netWeight ?? undefined,
      defaultStoneWeight: line.stoneWeight ?? undefined,
      defaultCaratWeight: line.caratWeight ?? undefined,
      hasStoneComponent: Boolean(
        line.stoneMetalTypeName || line.stoneTypeNames || toNumber(line.stoneCharge) > 0,
      ),
      defaultStoneMetalTypeName: line.stoneMetalTypeName ?? undefined,
      defaultStoneTypeNames: line.stoneTypeNames ?? undefined,
      hsnCode: line.hsnCode ?? undefined,
      isActive: true,
    },
  });

  const stock = await tx.inventoryStock.create({
    select: { id: true },
    data: {
      storeId,
      productId: product.id,
      stockCode: await nextStockCode(tx, storeId),
      metalTypeId: metalTypeId ?? undefined,
      purity: line.purity ?? undefined,
      purityLabel: line.purityLabel ?? undefined,
      quantity,
      status: InventoryStockStatus.IN_STOCK,
      grossWeight: toDecimal(line.grossWeight),
      netWeight: toDecimal(line.netWeight),
      caratWeight: toDecimal(line.caratWeight),
      stoneWeight: toDecimal(line.stoneWeight),
      dmoWeight: toDecimal(line.dmoWeight),
      saleRate: toDecimal(line.rate),
      makingCharge: line.makingCharge,
      makingChargeType,
      stoneCharge: line.stoneCharge,
      stoneRate: line.stoneRate ?? undefined,
      stoneMetalTypeName: line.stoneMetalTypeName ?? undefined,
      stoneTypeNames: line.stoneTypeNames ?? undefined,
      purchaseDate: new Date(),
      locationId: locationId ?? undefined,
      remarks: `Added while billing a new line item (${referenceType})`,
      createdById: actor.id ?? undefined,
      createdByName: actor.name ?? actor.email ?? undefined,
      createdByRole: actor.role ?? undefined,
    },
  });

  await tx.inventoryTransaction.create({
    data: {
      inventoryStockId: stock.id,
      transactionType: InventoryTransactionType.ADJUSTMENT,
      quantity,
      grossWeight: toDecimal(line.grossWeight),
      netWeight: toDecimal(line.netWeight),
      referenceType,
      notes: "Stock added for a new line item at sale time",
    },
  });

  return stock.id;
}
