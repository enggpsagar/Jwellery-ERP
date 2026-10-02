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

import { prisma } from "@/lib/prisma";
import { buildSkuPrefix } from "@/lib/inventory/product-sku";
import { markSourcePartiesAsSuppliers, missingSourcePartyError } from "@/lib/inventory/line-source-party";

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
  // The catalog classification Add Product asks for — required here too
  // (see validateManualSaleLines) so a product minted at sale time lands
  // in the same Category/Type/Style buckets that reports and the product
  // list group by, instead of an unclassified row nothing reconciles to.
  categoryId?: string | null;
  categoryTypeId?: string | null;
  targetStyleId?: string | null;
  gstRateId?: string | null;
  // Who the piece came in from (a Party — a Supplier when the Supplier
  // module is on). Required on a new line; written to the minted stock row's
  // vendorId/vendorName, the same columns createPurchase fills, so the
  // Item Ledger can say "Purchased from X" instead of "Unknown vendor".
  vendorId?: string | null;
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

/**
 * Add Product's own required-field rules (createProduct /
 * validateTaxonomySelection in lib/actions/inventory/product-actions.ts),
 * applied to every line that has no stock yet and will mint a Product on
 * save. Run before the sale's transaction; returns the first problem as a
 * user-facing message, or null when every manual line is complete. Lines
 * already linked to stock are skipped — their product already exists.
 */
export async function validateManualSaleLines(
  storeId: string,
  lines: (ManualSaleLine & { inventoryStockId?: string | null })[],
): Promise<string | null> {
  const manual = lines.filter((line) => !line.inventoryStockId);
  if (!manual.length) return null;

  const ids = (pick: (line: ManualSaleLine) => string | null | undefined) => [
    ...new Set(manual.map(pick).filter((id): id is string => Boolean(id))),
  ];

  const [settings, activeStyleCount, metals, categories, types, styles, vendors] = await Promise.all([
    prisma.businessSettings.findUnique({ where: { storeId }, select: { styleFieldEnabled: true } }),
    prisma.storeStyle.count({ where: { storeId, isActive: true } }),
    prisma.storeMetal.findMany({
      where: { storeId, id: { in: ids((l) => l.metalTypeId) } },
      select: { id: true, isGemstone: true },
    }),
    prisma.storeCategory.findMany({
      where: { storeId, id: { in: ids((l) => l.categoryId) } },
      select: { id: true },
    }),
    prisma.storeCategoryType.findMany({
      where: { storeId, id: { in: ids((l) => l.categoryTypeId) } },
      select: { id: true, categoryId: true },
    }),
    prisma.storeStyle.findMany({
      where: { storeId, id: { in: ids((l) => l.targetStyleId) } },
      select: { id: true },
    }),
    prisma.customer.findMany({
      where: { storeId, isArchived: false, id: { in: ids((l) => l.vendorId) } },
      select: { id: true },
    }),
  ]);
  const metalById = new Map(metals.map((m) => [m.id, m]));
  const categoryIds = new Set(categories.map((c) => c.id));
  const typeById = new Map(types.map((t) => [t.id, t]));
  const styleIds = new Set(styles.map((s) => s.id));
  const vendorIds = new Set(vendors.map((v) => v.id));
  // Only required when there is something to pick: a store created after
  // StoreStyle's backfill migration starts with no styles at all, and a
  // sale shouldn't be blocked on a list it can't choose from.
  const styleRequired = settings?.styleFieldEnabled !== false && activeStyleCount > 0;

  for (const line of manual) {
    const name = line.itemName?.trim();
    const label = name ? `"${name}"` : "a new line item";
    if (!name) return "Enter an item name for every new line item.";

    const metal = line.metalTypeId ? metalById.get(line.metalTypeId) : undefined;
    if (!metal) return `Select a metal type for ${label}.`;

    // Same exemption as Add Product: a loose stone isn't an ornament.
    if (!line.categoryId) {
      if (!metal.isGemstone) return `Select a category for ${label}.`;
    } else if (!categoryIds.has(line.categoryId)) {
      return `The category picked for ${label} is invalid — pick it again.`;
    }

    if (line.categoryTypeId && typeById.get(line.categoryTypeId)?.categoryId !== line.categoryId) {
      return `The type picked for ${label} doesn't belong to its category — pick it again.`;
    }

    if (line.targetStyleId) {
      if (!styleIds.has(line.targetStyleId)) return `The style picked for ${label} is invalid — pick it again.`;
    } else if (styleRequired) {
      return `Select a style for ${label}.`;
    }

    const sourceError = missingSourcePartyError(line);
    if (sourceError) return sourceError;
    if (!vendorIds.has(line.vendorId as string)) {
      return `The "Purchased From" party picked for ${label} is invalid — pick it again.`;
    }

    if (!(toNumber(line.grossWeight) > 0)) return `Enter the gross weight for ${label}.`;
    if (!(toNumber(line.netWeight) > 0)) return `Enter the net weight for ${label}.`;
  }

  return null;
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

  // Every id below is re-resolved against this store (a stale or foreign
  // id is dropped, never attached) — validateManualSaleLines has already
  // rejected a sale missing a required one, so this is only the backstop.
  const [businessSettings, metalRow, categoryRow, categoryTypeRow, styleRow, gstRateRow, vendorRow] =
    await Promise.all([
      tx.businessSettings.findUnique({ where: { storeId }, select: { skuFormat: true } }),
      line.metalTypeId
        ? tx.storeMetal.findFirst({ where: { id: line.metalTypeId, storeId }, select: { id: true, name: true } })
        : Promise.resolve(null),
      line.categoryId
        ? tx.storeCategory.findFirst({ where: { id: line.categoryId, storeId }, select: { id: true, name: true } })
        : Promise.resolve(null),
      line.categoryTypeId && line.categoryId
        ? tx.storeCategoryType.findFirst({
            where: { id: line.categoryTypeId, storeId, categoryId: line.categoryId },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
      line.targetStyleId
        ? tx.storeStyle.findFirst({ where: { id: line.targetStyleId, storeId }, select: { id: true, name: true } })
        : Promise.resolve(null),
      line.gstRateId
        ? tx.gstRate.findFirst({ where: { id: line.gstRateId, storeId }, select: { id: true } })
        : Promise.resolve(null),
      line.vendorId
        ? tx.customer.findFirst({
            where: { id: line.vendorId, storeId, isArchived: false },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
    ]);
  const metalTypeId = metalRow?.id ?? null;

  // The line carries the per-Metal Purity's label (InvoiceItem.purityLabel),
  // not its id — resolved back to the StoreMetalPurity row so the Product
  // gets the same FK (and SKU purity code) Add Product would give it.
  const purityRow =
    metalTypeId && line.purityLabel
      ? await tx.storeMetalPurity.findFirst({
          where: { storeId, storeMetalId: metalTypeId, label: line.purityLabel },
          select: { id: true, skuCode: true },
        })
      : null;

  const skuPrefix = buildSkuPrefix({
    metalName: metalRow?.name ?? "X",
    purity: line.purity ?? null,
    purityCode: purityRow?.skuCode,
    targetStyleName: styleRow?.name ?? null,
    categoryTypeName: categoryTypeRow?.name ?? null,
    categoryName: categoryRow?.name ?? null,
    format: businessSettings?.skuFormat,
  });

  const makingChargeType =
    line.makingChargeType === ChargeType.PERCENTAGE ? ChargeType.PERCENTAGE : ChargeType.FIXED;
  const quantity = Math.max(1, Math.trunc(toNumber(line.quantity)) || 1);
  const itemName = line.itemName?.trim() || "Manually Added Item";
  const hasStoneComponent = Boolean(
    line.stoneMetalTypeName || line.stoneTypeNames || toNumber(line.stoneCharge) > 0,
  );

  const product = await tx.product.create({
    select: { id: true },
    data: {
      storeId,
      productCode: await nextProductCode(tx, storeId, skuPrefix),
      name: itemName,
      categoryId: categoryRow?.id ?? undefined,
      categoryTypeId: categoryTypeRow?.id ?? undefined,
      targetStyleId: styleRow?.id ?? undefined,
      metalTypeId: metalTypeId ?? undefined,
      defaultPurity: line.purity ?? undefined,
      storeMetalPurityId: purityRow?.id ?? undefined,
      defaultMakingCharge: line.makingCharge,
      defaultMakingChargeType: makingChargeType,
      defaultStoneCharge: line.stoneCharge,
      defaultStoneRate: line.stoneRate ?? undefined,
      defaultGrossWeight: line.grossWeight ?? undefined,
      defaultNetWeight: line.netWeight ?? undefined,
      defaultStoneWeight: line.stoneWeight ?? undefined,
      defaultCaratWeight: line.caratWeight ?? undefined,
      hasStoneComponent,
      defaultStoneMetalTypeName: line.stoneMetalTypeName ?? undefined,
      defaultStoneTypeNames: line.stoneTypeNames ?? undefined,
      hsnCode: line.hsnCode ?? undefined,
      isActive: true,
    },
  });

  // Add Product always writes the metal/stone breakdown rows too (the
  // scalar fields above are only a summary of component[0]) — readers of
  // the product's detail view and per-component GST expect them.
  if (metalTypeId) {
    await tx.productMetalComponent.create({
      data: {
        productId: product.id,
        metalTypeId,
        storeMetalPurityId: purityRow?.id ?? null,
        grossWeight: toDecimal(line.grossWeight) ?? null,
        netWeight: toDecimal(line.netWeight) ?? null,
        gstRateId: gstRateRow?.id ?? null,
        sortOrder: 0,
      },
    });
  }
  if (hasStoneComponent && line.stoneMetalTypeName) {
    await tx.productStoneComponent.create({
      data: {
        productId: product.id,
        stoneMetalTypeName: line.stoneMetalTypeName,
        stoneTypeNames: line.stoneTypeNames ?? null,
        caratWeight: toDecimal(line.caratWeight) ?? null,
        stoneWeight: toDecimal(line.stoneWeight) ?? null,
        stoneRate: toDecimal(line.stoneRate) ?? null,
        stoneCharge: toDecimal(line.stoneCharge) ?? null,
        gstRateId: gstRateRow?.id ?? null,
        sortOrder: 0,
      },
    });
  }

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
      vendorId: vendorRow?.id ?? undefined,
      vendorName: vendorRow?.name ?? undefined,
      purchaseDate: new Date(),
      locationId: locationId ?? undefined,
      remarks: `Added while billing a new line item (${referenceType})${
        vendorRow ? ` — purchased from ${vendorRow.name}` : ""
      }`,
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
      notes: `Stock added for a new line item at sale time${vendorRow ? ` — from ${vendorRow.name}` : ""}`,
    },
  });

  if (vendorRow) await markSourcePartiesAsSuppliers(tx, storeId, [vendorRow.id]);

  return stock.id;
}
