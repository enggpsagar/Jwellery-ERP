// Old Gold Exchange — at the counter a customer hands in old gold and buys
// new jewellery in one go. Recorded as two linked records:
//
//   Customer → Business: a real Purchase (isOldGoldExchange, numbered
//     OG-YYYY-NNNN, vendor = the customer) whose lines become IN_STOCK old
//     gold stock with their pure 24K weight (fineWeight), valued at
//     fine weight × fine rate − deduction%.
//   Business → Customer: the Invoice itself, linked via
//     Purchase.exchangeInvoiceId.
//
// Money: one CREDIT (OLD_GOLD_EXCHANGE) on the customer for the full value,
// against the Purchase — never the invoice, so cancelling the sale leaves
// the customer holding that value as store credit (the gold stays in stock).
// The part the bill needed is counted in the invoice's paidAmount; any
// excess either stays as store credit (nothing more to post) or is paid out
// now (a DEBIT PAYMENT_OUT on the customer).
//
// Not a "use server" file — called from inside createInvoice's transaction.
import "server-only";

import {
  InventoryFinish,
  InventoryStockStatus,
  InventoryTransactionType,
  LedgerEntryType,
  LedgerSourceType,
  OldGoldExcessMode,
  PaymentMethod,
  Prisma,
  PurityType,
  type UserRole,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getFineWeightResolver } from "@/lib/fine-weight";
import { oldGoldLineValue, round2 } from "@/lib/old-gold/value";

export type OldGoldLineInput = {
  description?: string | null;
  metalTypeId?: string | null;
  purityLabel?: string | null;
  purity?: string | null;
  grossWeight?: number | null;
  netWeight?: number | null;
  deductionPercent?: number | null;
  rate?: number | null;
};

export type ResolvedOldGoldLine = {
  description: string;
  metalTypeId: string;
  metalName: string;
  purityLabel: string | null;
  purity: PurityType | null;
  grossWeight: number | null;
  netWeight: number;
  fineWeight: number;
  deductionPercent: number;
  rate: number;
  value: number;
};

const PURITY_VALUES = new Set<string>(Object.values(PurityType));

function toNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Validates the submitted old-gold lines against this store and recomputes
 * each one's fine weight and value server-side (the form's figures are only
 * a preview). Returns the first problem as a user-facing message.
 */
export async function resolveOldGoldLines(
  storeId: string,
  lines: OldGoldLineInput[],
): Promise<{ error: string } | { lines: ResolvedOldGoldLine[]; total: number }> {
  if (!lines.length) return { lines: [], total: 0 };

  const metalIds = [...new Set(lines.map((line) => line.metalTypeId).filter((id): id is string => Boolean(id)))];
  const [metals, fineOf] = await Promise.all([
    prisma.storeMetal.findMany({
      where: { storeId, id: { in: metalIds } },
      select: { id: true, name: true, hasPurity: true },
    }),
    getFineWeightResolver(storeId),
  ]);
  const metalById = new Map(metals.map((metal) => [metal.id, metal]));

  const resolved: ResolvedOldGoldLine[] = [];
  for (const [index, line] of lines.entries()) {
    const label = `old gold line ${index + 1}`;
    const metal = line.metalTypeId ? metalById.get(line.metalTypeId) : undefined;
    if (!metal) return { error: `Select the metal for ${label}.` };
    if (!metal.hasPurity) return { error: `${metal.name} has no purity, so it can't be taken as old gold (${label}).` };

    const purityLabel = line.purityLabel?.trim() || null;
    const purity = line.purity && PURITY_VALUES.has(line.purity) ? (line.purity as PurityType) : null;
    if (!purityLabel && !purity) return { error: `Select the purity (carat) for ${label}.` };

    const netWeight = toNumber(line.netWeight);
    if (!(netWeight > 0)) return { error: `Enter the net weight for ${label}.` };
    const grossWeight = line.grossWeight ? toNumber(line.grossWeight) : null;
    if (grossWeight !== null && grossWeight > 0 && grossWeight < netWeight) {
      return { error: `Gross weight can't be less than net weight for ${label}.` };
    }

    const rate = toNumber(line.rate);
    if (!(rate > 0)) return { error: `Enter the 24K rate for ${label}.` };
    const deductionPercent = toNumber(line.deductionPercent);
    if (deductionPercent < 0 || deductionPercent >= 100) {
      return { error: `Deduction for ${label} must be between 0 and 100%.` };
    }

    const fineWeight = fineOf({ metalTypeId: metal.id, purityLabel, purity, netWeight }) ?? netWeight;
    resolved.push({
      description: line.description?.trim() || `Old ${metal.name}`,
      metalTypeId: metal.id,
      metalName: metal.name,
      purityLabel,
      purity,
      grossWeight: grossWeight && grossWeight > 0 ? grossWeight : null,
      netWeight,
      fineWeight,
      deductionPercent,
      rate,
      value: oldGoldLineValue(fineWeight, rate, deductionPercent),
    });
  }

  return { lines: resolved, total: round2(resolved.reduce((sum, line) => sum + line.value, 0)) };
}

/** OG-{year}-{0001}, highest existing wins — same rule as the stock codes. */
async function nextExchangeNumber(tx: Prisma.TransactionClient, storeId: string) {
  const year = new Date().getFullYear();
  const existing = await tx.purchase.findMany({
    where: { storeId, purchaseNumber: { startsWith: `OG-${year}-` } },
    select: { purchaseNumber: true },
  });
  const highest = existing.reduce((max, row) => {
    const match = /^OG-\d{4}-(\d+)$/.exec(row.purchaseNumber);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `OG-${year}-${String(highest + 1).padStart(4, "0")}`;
}

/** Same STK-{year}-{0001} numbering as getNextStockCode / manual-line stock. */
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

/** One reusable "Old Gold — Gold 22K" catalog product per metal + purity. */
async function oldGoldProductId(tx: Prisma.TransactionClient, storeId: string, line: ResolvedOldGoldLine) {
  const purityKey = (line.purityLabel ?? line.purity ?? "").replace(/[^A-Za-z0-9.]/g, "").toUpperCase();
  const productCode = `OLDGOLD-${line.metalName.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}-${purityKey || "NA"}`;
  const existing = await tx.product.findFirst({ where: { storeId, productCode }, select: { id: true } });
  if (existing) return existing.id;

  const purityRow = line.purityLabel
    ? await tx.storeMetalPurity.findFirst({
        where: { storeId, storeMetalId: line.metalTypeId, label: line.purityLabel },
        select: { id: true },
      })
    : null;
  const created = await tx.product.create({
    select: { id: true },
    data: {
      storeId,
      productCode,
      name: `Old Gold — ${line.metalName} ${line.purityLabel ?? line.purity ?? ""}`.trim(),
      metalTypeId: line.metalTypeId,
      defaultPurity: line.purity ?? undefined,
      storeMetalPurityId: purityRow?.id ?? undefined,
      isActive: true,
    },
  });
  return created.id;
}

/**
 * Writes the Customer → Business half of an exchange inside the sale's own
 * transaction: the OG Purchase, its stock rows, and the customer's ledger
 * entries. Returns the Purchase id and number.
 */
export async function recordOldGoldExchange(
  tx: Prisma.TransactionClient,
  params: {
    storeId: string;
    customerId: string;
    customerName: string;
    invoiceId: string;
    invoiceNumber: string;
    lines: ResolvedOldGoldLine[];
    total: number;
    applied: number;
    excess: number;
    excessMode: OldGoldExcessMode | null;
    payout?: { method: PaymentMethod; reference?: string | null } | null;
    locationId?: string | null;
    actor: { id?: string | null; name?: string | null; email?: string | null; role?: UserRole | null };
  },
) {
  const { storeId, customerId, customerName, invoiceId, invoiceNumber, lines, total, applied, excess, actor } = params;
  const purchaseNumber = await nextExchangeNumber(tx, storeId);
  const now = new Date();

  const items: Prisma.PurchaseItemCreateWithoutPurchaseInput[] = [];
  for (const line of lines) {
    const productId = await oldGoldProductId(tx, storeId, line);
    const stock = await tx.inventoryStock.create({
      select: { id: true },
      data: {
        storeId,
        productId,
        stockCode: await nextStockCode(tx, storeId),
        metalTypeId: line.metalTypeId,
        purity: line.purity ?? undefined,
        purityLabel: line.purityLabel ?? undefined,
        quantity: 1,
        status: InventoryStockStatus.IN_STOCK,
        finish: InventoryFinish.KACHA,
        grossWeight: line.grossWeight ?? undefined,
        netWeight: line.netWeight,
        fineWeight: line.fineWeight,
        purchaseRate: line.rate,
        purchaseAmount: line.value,
        vendorId: customerId,
        vendorName: customerName,
        purchaseDate: now,
        locationId: params.locationId ?? undefined,
        remarks: `Old gold from ${customerName} — ${purchaseNumber}, exchanged against ${invoiceNumber}`,
        createdById: actor.id ?? undefined,
        createdByName: actor.name ?? actor.email ?? undefined,
        createdByRole: actor.role ?? undefined,
      },
    });
    await tx.inventoryTransaction.create({
      data: {
        inventoryStockId: stock.id,
        transactionType: InventoryTransactionType.PURCHASE,
        quantity: 1,
        grossWeight: line.grossWeight ?? undefined,
        netWeight: line.netWeight,
        referenceType: "OldGoldExchange",
        notes: `Old gold received — ${purchaseNumber}`,
      },
    });
    items.push({
      product: { connect: { id: productId } },
      itemName: line.description,
      metalType: { connect: { id: line.metalTypeId } },
      purity: line.purity ?? undefined,
      purityLabel: line.purityLabel ?? undefined,
      quantity: 1,
      grossWeight: line.grossWeight ?? undefined,
      netWeight: line.netWeight,
      fineWeight: line.fineWeight,
      rate: line.rate,
      deductionPercent: line.deductionPercent,
      lineTotal: line.value,
      inventoryStock: { connect: { id: stock.id } },
    });
  }

  const purchase = await tx.purchase.create({
    select: { id: true, purchaseNumber: true },
    data: {
      storeId,
      purchaseNumber,
      vendorId: customerId,
      purchaseDate: now,
      status: "PAID",
      subtotal: total,
      totalAmount: total,
      paidAmount: total,
      balanceAmount: 0,
      notes: `Old gold exchanged against ${invoiceNumber}`,
      locationId: params.locationId ?? undefined,
      createdById: actor.id ?? undefined,
      createdByName: actor.name ?? actor.email ?? undefined,
      createdByRole: actor.role ?? undefined,
      isOldGoldExchange: true,
      exchangeInvoiceId: invoiceId,
      oldGoldAppliedAmount: applied,
      oldGoldExcessAmount: excess,
      oldGoldExcessMode: excess > 0 ? params.excessMode ?? OldGoldExcessMode.STORE_CREDIT : null,
      items: { create: items },
    },
  });

  // A party goods came in from is a supplier from now on (createPurchase does the same).
  await tx.customer.updateMany({ where: { id: customerId, storeId, isSupplier: false }, data: { isSupplier: true } });

  await tx.ledgerEntry.create({
    data: {
      storeId,
      type: LedgerEntryType.CREDIT,
      sourceType: LedgerSourceType.OLD_GOLD_EXCHANGE,
      customerId,
      purchaseId: purchase.id,
      amount: total,
      description: `Old gold received (${purchaseNumber}) against ${invoiceNumber}`,
      locationId: params.locationId ?? undefined,
      createdByUserId: actor.id ?? undefined,
    },
  });

  if (excess > 0 && params.excessMode === OldGoldExcessMode.PAID_OUT && params.payout) {
    await tx.ledgerEntry.create({
      data: {
        storeId,
        type: LedgerEntryType.DEBIT,
        sourceType: LedgerSourceType.PAYMENT_OUT,
        customerId,
        purchaseId: purchase.id,
        amount: excess,
        paymentMethod: params.payout.method,
        paymentReference: params.payout.reference ?? undefined,
        description: `Old gold balance paid to ${customerName} (${purchaseNumber})`,
        locationId: params.locationId ?? undefined,
        createdByUserId: actor.id ?? undefined,
      },
    });
  }

  return purchase;
}
