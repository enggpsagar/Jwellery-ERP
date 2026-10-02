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
import { GRAMS_PER_CARAT } from "@/lib/purity";
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
  // A stone set in the metal ("Does this piece have a stone?"), or — for a
  // loose diamond/gemstone line — caratWeight is the item's own weight.
  hasStone?: boolean | null;
  stoneMetalTypeName?: string | null;
  stoneTypeNames?: string | null;
  caratWeight?: number | null;
  /** Grams. */
  stoneWeight?: number | null;
  stoneRate?: number | null;
  stoneCharge?: number | null;
};

export type ResolvedOldGoldLine = {
  description: string;
  metalTypeId: string;
  metalName: string;
  /** A loose diamond/gemstone — priced per carat, no purity. */
  isGemstone: boolean;
  stone: {
    metalTypeName: string;
    typeNames: string | null;
    caratWeight: number | null;
    weightGrams: number | null;
    rate: number | null;
    charge: number;
  } | null;
  purityLabel: string | null;
  purity: PurityType | null;
  grossWeight: number | null;
  netWeight: number;
  fineWeight: number;
  /** Loose stone's own carats, or the carats of the stone set in the metal. */
  caratWeight: number | null;
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
      select: { id: true, name: true, hasPurity: true, isGemstone: true, primaryUnit: true },
    }),
    getFineWeightResolver(storeId),
  ]);
  const metalById = new Map(metals.map((metal) => [metal.id, metal]));
  const stoneNames = new Set(
    (
      await prisma.storeMetal.findMany({ where: { storeId, isGemstone: true }, select: { name: true } })
    ).map((stone) => stone.name),
  );

  const resolved: ResolvedOldGoldLine[] = [];
  for (const [index, line] of lines.entries()) {
    const label = `item bought ${index + 1}`;
    const metal = line.metalTypeId ? metalById.get(line.metalTypeId) : undefined;
    if (!metal) return { error: `Select the metal or stone for ${label}.` };

    const deduction = toNumber(line.deductionPercent);
    if (deduction < 0 || deduction >= 100) {
      return { error: `Deduction for ${label} must be between 0 and 100%.` };
    }

    // A loose diamond / gemstone: carats × rate per carat, no purity.
    if (metal.isGemstone) {
      const carats = toNumber(line.caratWeight);
      if (!(carats > 0)) return { error: `Enter the carat weight for ${label}.` };
      const gemRate = toNumber(line.rate);
      if (!(gemRate > 0)) return { error: `Enter the rate per carat for ${label}.` };
      const netWeight = metal.primaryUnit === "CARAT" ? carats : carats * GRAMS_PER_CARAT;
      resolved.push({
        description: line.description?.trim() || metal.name,
        metalTypeId: metal.id,
        metalName: metal.name,
        isGemstone: true,
        stone: null,
        purityLabel: null,
        purity: null,
        grossWeight: null,
        netWeight,
        fineWeight: netWeight,
        caratWeight: carats,
        deductionPercent: deduction,
        rate: gemRate,
        value: round2(carats * gemRate * (1 - deduction / 100)),
      });
      continue;
    }

    if (!metal.hasPurity) return { error: `${metal.name} has no purity, so it can't be bought here (${label}).` };

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
    if (!(rate > 0)) return { error: `Enter the pure (24K / 999) rate for ${label}.` };
    const deductionPercent = deduction;

    let stone: ResolvedOldGoldLine["stone"] = null;
    if (line.hasStone) {
      const stoneName = line.stoneMetalTypeName?.trim() || "";
      if (!stoneNames.has(stoneName)) return { error: `Select which stone is in ${label}.` };
      const weightGrams = toNumber(line.stoneWeight);
      if (weightGrams < 0) return { error: `Stone weight for ${label} can't be negative.` };
      if (grossWeight !== null && grossWeight > 0 && netWeight + weightGrams > grossWeight + 0.0005) {
        return { error: `Net metal weight plus stone weight is more than the gross weight for ${label}.` };
      }
      const carats = toNumber(line.caratWeight) || null;
      const stoneRate = toNumber(line.stoneRate) || null;
      const charge = line.stoneCharge != null ? toNumber(line.stoneCharge) : (carats ?? 0) * (stoneRate ?? 0);
      if (charge < 0) return { error: `Stone value for ${label} can't be negative.` };
      stone = {
        metalTypeName: stoneName,
        typeNames: line.stoneTypeNames?.trim() || null,
        caratWeight: carats,
        weightGrams: weightGrams || null,
        rate: stoneRate,
        charge: round2(charge),
      };
    }

    const fineWeight = fineOf({ metalTypeId: metal.id, purityLabel, purity, netWeight }) ?? netWeight;
    const metalValue = oldGoldLineValue(fineWeight, rate, deductionPercent);
    resolved.push({
      description: line.description?.trim() || `Old ${metal.name}`,
      metalTypeId: metal.id,
      metalName: metal.name,
      isGemstone: false,
      stone,
      caratWeight: stone?.caratWeight ?? null,
      purityLabel,
      purity,
      grossWeight: grossWeight && grossWeight > 0 ? grossWeight : null,
      netWeight,
      fineWeight,
      deductionPercent,
      rate,
      value: round2(metalValue + (stone?.charge ?? 0)),
    });
  }

  return { lines: resolved, total: round2(resolved.reduce((sum, line) => sum + line.value, 0)) };
}

/** EX-{year}-{0001}, highest existing wins — same rule as the stock codes.
 *  (The first exchanges, gold-only, were numbered OG-; those keep theirs.) */
async function nextExchangeNumber(tx: Prisma.TransactionClient, storeId: string) {
  const year = new Date().getFullYear();
  const existing = await tx.purchase.findMany({
    where: { storeId, purchaseNumber: { startsWith: `EX-${year}-` } },
    select: { purchaseNumber: true },
  });
  const highest = existing.reduce((max, row) => {
    const match = /^EX-\d{4}-(\d+)$/.exec(row.purchaseNumber);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `EX-${year}-${String(highest + 1).padStart(4, "0")}`;
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

/** One reusable "Bought from customer — Gold 22K" catalog product per
 *  metal (or stone) + purity. */
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
      name: `Bought from customer — ${line.metalName} ${line.purityLabel ?? line.purity ?? ""}`.trim(),
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
        caratWeight: line.caratWeight ?? undefined,
        stoneWeight: line.stone?.weightGrams ?? undefined,
        stoneRate: line.stone?.rate ?? undefined,
        stoneCharge: line.stone?.charge ?? undefined,
        stoneMetalTypeName: line.stone?.metalTypeName ?? undefined,
        stoneTypeNames: line.stone?.typeNames ?? undefined,
        purchaseRate: line.rate,
        purchaseAmount: line.value,
        vendorId: customerId,
        vendorName: customerName,
        purchaseDate: now,
        locationId: params.locationId ?? undefined,
        remarks: `Bought from ${customerName} — ${purchaseNumber}, exchanged against ${invoiceNumber}`,
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
        notes: `Received from customer — ${purchaseNumber}`,
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
      caratWeight: line.caratWeight ?? undefined,
      stoneWeight: line.stone?.weightGrams ?? undefined,
      stoneRate: line.stone?.rate ?? undefined,
      stoneCharge: line.stone?.charge ?? 0,
      stoneMetalTypeName: line.stone?.metalTypeName ?? undefined,
      stoneTypeNames: line.stone?.typeNames ?? undefined,
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
      notes: `Bought from the customer in exchange against ${invoiceNumber}`,
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
      description: `Bought from customer (${purchaseNumber}) against ${invoiceNumber}`,
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
        description: `Exchange balance paid to ${customerName} (${purchaseNumber})`,
        locationId: params.locationId ?? undefined,
        createdByUserId: actor.id ?? undefined,
      },
    });
  }

  return purchase;
}
