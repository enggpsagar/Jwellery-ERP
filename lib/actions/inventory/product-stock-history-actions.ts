"use server";

import { InventoryTransactionType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getStoreIdForRead } from "@/lib/store-context";

/**
 * A product's stock ledger: every piece that came in (Purchase bill, Add
 * Stock / import, artisan receipt) and every sale / return against it, with
 * a running in-stock count and net weight.
 *
 * The "in" rows come from the InventoryStock rows themselves, not from
 * InventoryTransaction: Add Stock and Excel import never write a
 * transaction, while Purchase and artisan receipt do — reading the stock
 * rows covers all of them once. A piece's original quantity isn't stored
 * (quantity is the live remaining count), so it's rebuilt as remaining +
 * sold − returned. Sales/returns come from InventoryTransaction (SALE /
 * SALE_RETURN); DAMAGE is shown as a status note with no quantity change,
 * matching markStockDamaged. RESERVE/UNRESERVE don't move stock and are left
 * out. Weights are per piece × quantity, the same basis the Products list
 * uses for its in-stock weight; carats likewise (a loose stone's stock has
 * carats and no gram weight).
 *
 * Sold-by-weight lots (Product.soldByWeight, lib/inventory/weight-lot.ts):
 * a byWeight transaction carries exactly the weights that moved, and its
 * quantity is 1 only when it emptied (SALE) or refilled (SALE_RETURN) the
 * lot, else 0 — so those rows use their own weights and quantity. The lot's
 * stock row holds only what's left, so its "in" row is rebuilt as remaining
 * + Σ byWeight sales − Σ byWeight returns, quantity 1.
 */

export type ProductStockHistoryRow = {
  id: string;
  date: string;
  direction: "IN" | "OUT" | "NOTE";
  /** "Purchase", "Add Stock", "Artisan receipt", "Sale", "Estimate sale", "Sale return", "Damaged". */
  kind: string;
  /** Purchase / invoice / slip / credit note number, when there is one. */
  reference: string | null;
  /** Supplier for an "in", stock code always. */
  party: string | null;
  stockCode: string;
  stockId: string;
  /** Page of the purchase bill / invoice / estimate / credit note, if any. */
  referenceHref: string | null;
  quantity: number;
  grossWeight: number;
  netWeight: number;
  caratWeight: number;
  /** Part of a sold-by-weight lot moved (weights exact, quantity 0 or 1). */
  byWeight: boolean;
  /** Running totals after this row. */
  balanceQty: number;
  balanceNetWeight: number;
  balanceCaratWeight: number;
};

const OUT_TYPES = new Set<InventoryTransactionType>([InventoryTransactionType.SALE]);
const IN_TYPES = new Set<InventoryTransactionType>([InventoryTransactionType.SALE_RETURN]);

export async function getProductStockHistory(productId: string): Promise<ProductStockHistoryRow[]> {
  const storeId = await getStoreIdForRead();

  const stocks = await prisma.inventoryStock.findMany({
    where: { storeId, productId },
    select: {
      id: true,
      stockCode: true,
      quantity: true,
      grossWeight: true,
      netWeight: true,
      caratWeight: true,
      vendorName: true,
      purchaseDate: true,
      createdAt: true,
      transactions: {
        select: {
          id: true,
          transactionType: true,
          quantity: true,
          grossWeight: true,
          netWeight: true,
          caratWeight: true,
          byWeight: true,
          referenceType: true,
          referenceId: true,
          createdAt: true,
        },
      },
    },
  });
  if (stocks.length === 0) return [];

  const transactions = stocks.flatMap((stock) => stock.transactions);
  const idsOf = (type: string) =>
    [...new Set(transactions.filter((t) => t.referenceType === type && t.referenceId).map((t) => t.referenceId!))];

  const stockIds = stocks.map((stock) => stock.id);
  const [purchaseItems, invoices, slips, creditNotes] = await Promise.all([
    // A purchase line points at the stock row it created.
    prisma.purchaseItem.findMany({
      where: { inventoryStockId: { in: stockIds } },
      select: {
        inventoryStockId: true,
        purchase: { select: { id: true, purchaseNumber: true, purchaseDate: true, vendor: { select: { name: true } } } },
      },
    }),
    prisma.invoice.findMany({ where: { id: { in: idsOf("Invoice") }, storeId }, select: { id: true, invoiceNumber: true } }),
    prisma.kachaInvoice.findMany({ where: { id: { in: idsOf("KachaInvoice") }, storeId }, select: { id: true, slipNumber: true } }),
    prisma.creditNote.findMany({ where: { id: { in: idsOf("CreditNote") }, storeId }, select: { id: true, creditNoteNumber: true } }),
  ]);

  const purchaseByStock = new Map(purchaseItems.map((item) => [item.inventoryStockId, item.purchase]));
  const numberOf = new Map<string, string>([
    ...invoices.map((row) => [row.id, row.invoiceNumber] as [string, string]),
    ...slips.map((row) => [row.id, row.slipNumber] as [string, string]),
    ...creditNotes.map((row) => [row.id, row.creditNoteNumber] as [string, string]),
  ]);

  type Event = Omit<ProductStockHistoryRow, "balanceQty" | "balanceNetWeight" | "balanceCaratWeight"> & { sortKey: number };
  const events: Event[] = [];

  for (const stock of stocks) {
    const gross = Number(stock.grossWeight ?? 0);
    const net = Number(stock.netWeight ?? 0);
    const carat = Number(stock.caratWeight ?? 0);
    const lotMoves = stock.transactions.filter(
      (t) => t.byWeight && (OUT_TYPES.has(t.transactionType) || IN_TYPES.has(t.transactionType)),
    );
    const isLot = lotMoves.length > 0;

    let inQty: number;
    let inGross: number;
    let inNet: number;
    let inCarat: number;
    if (isLot) {
      // What's left + what was sold − what came back = the lot as it arrived.
      const moved = (field: "grossWeight" | "netWeight" | "caratWeight") =>
        lotMoves.reduce(
          (sum, t) => sum + (OUT_TYPES.has(t.transactionType) ? 1 : -1) * Number(t[field] ?? 0),
          0,
        );
      inQty = 1;
      inGross = Math.max(0, gross + moved("grossWeight"));
      inNet = Math.max(0, net + moved("netWeight"));
      inCarat = Math.max(0, carat + moved("caratWeight"));
    } else {
      const sold = stock.transactions
        .filter((t) => OUT_TYPES.has(t.transactionType))
        .reduce((sum, t) => sum + (t.quantity || 1), 0);
      const returned = stock.transactions
        .filter((t) => IN_TYPES.has(t.transactionType))
        .reduce((sum, t) => sum + (t.quantity || 1), 0);
      inQty = Math.max(stock.quantity + sold - returned, stock.quantity, 0);
      inGross = gross * inQty;
      inNet = net * inQty;
      inCarat = carat * inQty;
    }

    const purchase = purchaseByStock.get(stock.id);
    const artisan = stock.transactions.find((t) => t.transactionType === InventoryTransactionType.KARIGAR_RECEIPT);
    const inDate = purchase?.purchaseDate ?? stock.purchaseDate ?? stock.createdAt;
    events.push({
      id: `in-${stock.id}`,
      date: inDate.toISOString(),
      sortKey: stock.createdAt.getTime(),
      direction: "IN",
      kind: purchase ? "Purchase" : artisan ? "Artisan receipt" : "Add Stock",
      reference: purchase?.purchaseNumber ?? null,
      referenceHref: purchase ? `/purchases/${purchase.id}` : null,
      party: purchase?.vendor?.name ?? stock.vendorName ?? null,
      stockCode: stock.stockCode,
      stockId: stock.id,
      quantity: inQty,
      grossWeight: inGross,
      netWeight: inNet,
      caratWeight: inCarat,
      byWeight: false,
    });

    for (const t of stock.transactions) {
      const isOut = OUT_TYPES.has(t.transactionType);
      const isIn = IN_TYPES.has(t.transactionType);
      const isDamage = t.transactionType === InventoryTransactionType.DAMAGE;
      if (!isOut && !isIn && !isDamage) continue;
      // A byWeight row's quantity is real (0 = part of the lot moved); an
      // older by-piece row with no quantity counts as one piece.
      const qty = isDamage ? 0 : t.byWeight ? t.quantity : t.quantity || 1;
      const lotRow = t.byWeight && !isDamage;
      events.push({
        id: t.id,
        date: t.createdAt.toISOString(),
        sortKey: t.createdAt.getTime(),
        direction: isDamage ? "NOTE" : isOut ? "OUT" : "IN",
        kind: isDamage
          ? "Damaged"
          : isIn
            ? "Sale return"
            : t.referenceType === "KachaInvoice"
              ? "Estimate sale"
              : "Sale",
        reference: t.referenceId ? numberOf.get(t.referenceId) ?? null : null,
        referenceHref:
          t.referenceId && numberOf.has(t.referenceId)
            ? t.referenceType === "Invoice"
              ? `/billing/${t.referenceId}`
              : t.referenceType === "KachaInvoice"
                ? `/billing/kacha/${t.referenceId}`
                : t.referenceType === "CreditNote"
                  ? `/billing/credit-notes/${t.referenceId}`
                  : null
            : null,
        party: null,
        stockCode: stock.stockCode,
        stockId: stock.id,
        quantity: qty,
        grossWeight: lotRow ? Number(t.grossWeight ?? 0) : gross * qty,
        netWeight: lotRow ? Number(t.netWeight ?? 0) : net * qty,
        caratWeight: lotRow ? Number(t.caratWeight ?? 0) : carat * qty,
        byWeight: lotRow,
      });
    }
  }

  events.sort((a, b) => a.sortKey - b.sortKey);
  let balanceQty = 0;
  let balanceNetWeight = 0;
  let balanceCaratWeight = 0;
  return events.map(({ sortKey: _sortKey, ...event }) => {
    const sign = event.direction === "IN" ? 1 : event.direction === "OUT" ? -1 : 0;
    balanceQty += sign * event.quantity;
    balanceNetWeight += sign * event.netWeight;
    balanceCaratWeight += sign * event.caratWeight;
    // Stored precision (grams 5 dp, carats 3 dp) — no float dust like −0.000.
    const round = (value: number, decimals: number) => Number(value.toFixed(decimals)) || 0;
    return {
      ...event,
      balanceQty,
      balanceNetWeight: round(balanceNetWeight, 5),
      balanceCaratWeight: round(balanceCaratWeight, 3),
    };
  });
}
