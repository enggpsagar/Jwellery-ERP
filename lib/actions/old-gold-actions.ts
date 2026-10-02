"use server";

import { InventoryStockStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireStoreScope } from "@/lib/store-context";
import { getLocationScope, locationWhere } from "@/lib/location-scope";

export type OldGoldExchangeRow = {
  id: string;
  number: string;
  dateISO: string;
  customerId: string;
  customerName: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  lines: {
    id: string;
    description: string;
    metalName: string;
    purity: string;
    netWeight: number;
    fineWeight: number;
    rate: number;
    deductionPercent: number;
    value: number;
    /** A loose diamond/gemstone — weighed in carats, no purity. */
    isGemstone: boolean;
    caratWeight: number | null;
    /** A stone set in the metal piece. */
    stone: { name: string; caratWeight: number | null; value: number } | null;
    inStock: boolean;
  }[];
  totalNet: number;
  totalFine: number;
  value: number;
  applied: number;
  excess: number;
  excessMode: "STORE_CREDIT" | "PAID_OUT" | null;
};

export type OldGoldSummary = {
  count: number;
  totalNet: number;
  totalFine: number;
  totalValue: number;
  /** 24K weight of exchanged old gold still sitting in stock (not yet
   *  melted, issued to an artisan, or sold on). */
  inStockFine: number;
};

const ROW_LIMIT = 300;

/**
 * Every Old Gold Exchange (lib/old-gold/exchange.ts) — newest first, capped
 * at ROW_LIMIT — with its lines, linked invoice and how its value was
 * settled, plus store-wide totals in 24K fine weight.
 */
export async function getOldGoldExchanges(): Promise<{
  rows: OldGoldExchangeRow[];
  summary: OldGoldSummary;
  truncated: boolean;
}> {
  const storeId = await requireStoreScope();
  const scope = await getLocationScope();

  const purchases = await prisma.purchase.findMany({
    where: { storeId, isOldGoldExchange: true, ...locationWhere(scope) },
    orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
    take: ROW_LIMIT + 1,
    include: {
      vendor: { select: { id: true, name: true } },
      exchangeInvoice: { select: { id: true, invoiceNumber: true, status: true } },
      items: {
        include: {
          metalType: { select: { name: true, isGemstone: true } },
          inventoryStock: { select: { status: true, quantity: true } },
        },
      },
    },
  });

  const truncated = purchases.length > ROW_LIMIT;
  const rows: OldGoldExchangeRow[] = purchases.slice(0, ROW_LIMIT).map((purchase) => {
    const lines = purchase.items.map((item) => ({
      id: item.id,
      description: item.itemName,
      metalName: item.metalType?.name ?? "-",
      purity: item.metalType?.isGemstone ? "" : item.purityLabel ?? item.purity?.replace(/^[A-Z]+_/, "") ?? "-",
      netWeight: Number(item.netWeight ?? 0),
      fineWeight: Number(item.fineWeight ?? item.netWeight ?? 0),
      rate: Number(item.rate ?? 0),
      deductionPercent: Number(item.deductionPercent ?? 0),
      value: Number(item.lineTotal),
      isGemstone: Boolean(item.metalType?.isGemstone),
      caratWeight: item.caratWeight != null ? Number(item.caratWeight) : null,
      stone: item.stoneMetalTypeName
        ? {
            name: [item.stoneMetalTypeName, item.stoneTypeNames].filter(Boolean).join(" · "),
            caratWeight: item.caratWeight != null ? Number(item.caratWeight) : null,
            value: Number(item.stoneCharge ?? 0),
          }
        : null,
      inStock:
        item.inventoryStock?.status === InventoryStockStatus.IN_STOCK && (item.inventoryStock?.quantity ?? 0) > 0,
    }));
    return {
      id: purchase.id,
      number: purchase.purchaseNumber,
      dateISO: purchase.purchaseDate.toISOString(),
      customerId: purchase.vendor.id,
      customerName: purchase.vendor.name,
      invoiceId: purchase.exchangeInvoice?.id ?? null,
      invoiceNumber: purchase.exchangeInvoice?.invoiceNumber ?? null,
      invoiceStatus: purchase.exchangeInvoice?.status ?? null,
      lines,
      totalNet: lines.reduce((sum, line) => (line.isGemstone ? sum : sum + line.netWeight), 0),
      totalFine: lines.reduce((sum, line) => (line.isGemstone ? sum : sum + line.fineWeight), 0),
      value: Number(purchase.totalAmount),
      applied: Number(purchase.oldGoldAppliedAmount),
      excess: Number(purchase.oldGoldExcessAmount),
      excessMode: purchase.oldGoldExcessMode,
    };
  });

  // Totals over every exchange, not just the rows shown.
  const allItems = await prisma.purchaseItem.findMany({
    where: { purchase: { storeId, isOldGoldExchange: true, ...locationWhere(scope) } },
    select: {
      netWeight: true,
      fineWeight: true,
      lineTotal: true,
      metalType: { select: { isGemstone: true } },
      inventoryStock: { select: { status: true, quantity: true } },
    },
  });
  const count = await prisma.purchase.count({
    where: { storeId, isOldGoldExchange: true, ...locationWhere(scope) },
  });

  // Metal weights only — a loose stone's carats aren't grams of metal.
  const metalItems = allItems.filter((item) => !item.metalType?.isGemstone);
  const summary: OldGoldSummary = {
    count,
    totalNet: metalItems.reduce((sum, item) => sum + Number(item.netWeight ?? 0), 0),
    totalFine: metalItems.reduce((sum, item) => sum + Number(item.fineWeight ?? item.netWeight ?? 0), 0),
    totalValue: allItems.reduce((sum, item) => sum + Number(item.lineTotal), 0),
    inStockFine: metalItems.reduce(
      (sum, item) =>
        item.inventoryStock?.status === InventoryStockStatus.IN_STOCK && item.inventoryStock.quantity > 0
          ? sum + Number(item.fineWeight ?? item.netWeight ?? 0)
          : sum,
      0,
    ),
  };

  return { rows, summary, truncated };
}

/** The exchange traded in against one invoice, for its detail page. */
export async function getInvoiceOldGoldExchange(invoiceId: string) {
  const storeId = await requireStoreScope();
  const purchase = await prisma.purchase.findFirst({
    where: { storeId, exchangeInvoiceId: invoiceId, isOldGoldExchange: true },
    include: { items: { include: { metalType: { select: { name: true, isGemstone: true } } } } },
  });
  if (!purchase) return null;
  return {
    id: purchase.id,
    number: purchase.purchaseNumber,
    value: Number(purchase.totalAmount),
    applied: Number(purchase.oldGoldAppliedAmount),
    excess: Number(purchase.oldGoldExcessAmount),
    excessMode: purchase.oldGoldExcessMode,
    lines: purchase.items.map((item) => ({
      id: item.id,
      description: item.itemName,
      metalName: item.metalType?.name ?? "-",
      purity: item.metalType?.isGemstone ? "" : item.purityLabel ?? item.purity?.replace(/^[A-Z]+_/, "") ?? "-",
      netWeight: Number(item.netWeight ?? 0),
      fineWeight: Number(item.fineWeight ?? item.netWeight ?? 0),
      rate: Number(item.rate ?? 0),
      deductionPercent: Number(item.deductionPercent ?? 0),
      value: Number(item.lineTotal),
      isGemstone: Boolean(item.metalType?.isGemstone),
      caratWeight: item.caratWeight != null ? Number(item.caratWeight) : null,
      stone: item.stoneMetalTypeName
        ? {
            name: [item.stoneMetalTypeName, item.stoneTypeNames].filter(Boolean).join(" · "),
            caratWeight: item.caratWeight != null ? Number(item.caratWeight) : null,
            value: Number(item.stoneCharge ?? 0),
          }
        : null,
    })),
  };
}
