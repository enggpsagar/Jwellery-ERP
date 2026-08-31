// lib/actions/report-actions.ts
"use server";

import { InventoryStockStatus, InventoryTransactionType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireStoreScope } from "@/lib/store-context";
import { getLocationScope, locationWhere } from "@/lib/location-scope";
import { getFinenessMap, toFineWeight } from "@/lib/purity";

export type DateRange = { from?: string; to?: string };

function toDateRangeWhere(range: DateRange, field: string) {
  if (!range.from && !range.to) return {};

  return {
    [field]: {
      ...(range.from ? { gte: new Date(range.from) } : {}),
      ...(range.to ? { lte: new Date(range.to) } : {}),
    },
  };
}

/**
 * Sales summary for a date range: revenue, charges collected, and a
 * breakdown by metal type across invoice line items.
 */
export async function getSalesReport(range: DateRange = {}) {
  const storeId = await requireStoreScope();
  const scope = await getLocationScope();
  const where = { storeId, ...locationWhere(scope), ...toDateRangeWhere(range, "invoiceDate") };

  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { invoiceDate: "desc" },
    include: {
      customer: { select: { name: true } },
      items: {
        select: {
          metalType: { select: { id: true, name: true } },
          netWeight: true,
          lineTotal: true,
        },
      },
    },
  });

  const totalRevenue = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
  const totalMakingCharges = invoices.reduce((sum, inv) => sum + Number(inv.makingCharges), 0);
  const totalOutstanding = invoices.reduce((sum, inv) => sum + Number(inv.balanceAmount), 0);

  const byMetal = new Map<string, { name: string; weight: number; amount: number }>();
  for (const invoice of invoices) {
    for (const item of invoice.items) {
      const key = item.metalType?.id ?? "unassigned";
      const name = item.metalType?.name ?? "Unassigned";
      const entry = byMetal.get(key) ?? { name, weight: 0, amount: 0 };
      entry.weight += item.netWeight ? Number(item.netWeight) : 0;
      entry.amount += Number(item.lineTotal);
      byMetal.set(key, entry);
    }
  }

  return {
    invoiceCount: invoices.length,
    totalRevenue,
    totalMakingCharges,
    totalOutstanding,
    byMetal: Array.from(byMetal.values()),
    invoices: invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate.toISOString(),
      customerName: inv.customer.name,
      status: inv.status,
      totalAmount: Number(inv.totalAmount),
      balanceAmount: Number(inv.balanceAmount),
    })),
  };
}

/**
 * Current inventory valuation: active stock grouped by status, with
 * weight and an estimated value (sale rate x quantity where set).
 */
export async function getInventoryValuationReport() {
  const storeId = await requireStoreScope();
  const scope = await getLocationScope();
  const stockItems = await prisma.inventoryStock.findMany({
    where: { storeId, isActive: true, ...locationWhere(scope) },
    include: { product: { select: { name: true, category: true } } },
  });

  const byStatus = new Map<
    string,
    { count: number; netWeight: number; estimatedValue: number }
  >();

  for (const stock of stockItems) {
    const entry = byStatus.get(stock.status) ?? {
      count: 0,
      netWeight: 0,
      estimatedValue: 0,
    };
    entry.count += 1;
    entry.netWeight += stock.netWeight ? Number(stock.netWeight) : 0;
    entry.estimatedValue += stock.saleRate
      ? Number(stock.saleRate) * stock.quantity
      : Number(stock.purchaseAmount ?? 0);
    byStatus.set(stock.status, entry);
  }

  const inStockValue = byStatus.get(InventoryStockStatus.IN_STOCK)?.estimatedValue ?? 0;

  // On-hand only (IN_STOCK + RESERVED) — matches ON_HAND_STOCK_STATUSES in
  // dashboard-actions.ts. `stockItems.length` below the fold counts every
  // status ever recorded (including SOLD/DAMAGED/ARCHIVED), which is right
  // for the full byStatus breakdown but wrong for a "how much do I have"
  // headline figure.
  const onHandStatuses: InventoryStockStatus[] = [
    InventoryStockStatus.IN_STOCK,
    InventoryStockStatus.RESERVED,
  ];
  const onHandItems = stockItems.filter((stock) =>
    onHandStatuses.includes(stock.status),
  ).length;

  return {
    totalItems: onHandItems,
    totalItemsAllTime: stockItems.length,
    inStockValue,
    byStatus: Array.from(byStatus.entries()).map(([status, data]) => ({
      status,
      ...data,
    })),
  };
}

/**
 * Open karigar jobs — stock currently out with a karigar and not yet
 * received back, with total gold/silver weight outstanding per karigar.
 */
export async function getKarigarOutstandingReport() {
  const storeId = await requireStoreScope();
  const scope = await getLocationScope();
  const openJobs = await prisma.karigarJob.findMany({
    where: { storeId, receivedDate: null, ...locationWhere(scope) },
    orderBy: { issueDate: "desc" },
    include: {
      karigar: { select: { name: true, code: true } },
      metalType: { select: { name: true } },
    },
  });

  const byKarigar = new Map<string, { name: string; jobs: number; weightOut: number }>();

  for (const job of openJobs) {
    const key = job.karigarId;
    const entry = byKarigar.get(key) ?? {
      name: job.karigar.name,
      jobs: 0,
      weightOut: 0,
    };
    entry.jobs += 1;
    entry.weightOut += job.issueWeight ? Number(job.issueWeight) : 0;
    byKarigar.set(key, entry);
  }

  return {
    openJobCount: openJobs.length,
    byKarigar: Array.from(byKarigar.values()),
    jobs: openJobs.map((job) => ({
      id: job.id,
      jobNumber: job.jobNumber,
      karigarName: job.karigar.name,
      issueDate: job.issueDate.toISOString(),
      expectedDate: job.expectedDate?.toISOString() ?? null,
      issueWeight: job.issueWeight ? Number(job.issueWeight) : null,
      metalType: job.metalType?.name ?? null,
    })),
  };
}

/**
 * Customers with an outstanding balance across their invoices, highest
 * dues first.
 */
export async function getCustomerDuesReport() {
  const storeId = await requireStoreScope();
  const customers = await prisma.customer.findMany({
    where: { storeId, isActive: true, isArchived: false },
    include: {
      invoices: {
        where: { balanceAmount: { gt: 0 } },
        select: { id: true, invoiceNumber: true, balanceAmount: true },
      },
    },
  });

  const withDues = customers
    .map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      totalDue: customer.invoices.reduce(
        (sum, inv) => sum + Number(inv.balanceAmount),
        0,
      ),
      invoiceCount: customer.invoices.length,
    }))
    .filter((customer) => customer.totalDue > 0)
    .sort((a, b) => b.totalDue - a.totalDue);

  return {
    customerCount: withDues.length,
    totalDue: withDues.reduce((sum, c) => sum + c.totalDue, 0),
    customers: withDues,
  };
}

/**
 * Gold-flow reconciliation: tracks every gram of fine metal from purchase
 * through karigar work-in-progress to sale/remaining stock, for a date
 * range (date-ranged flow figures) alongside point-in-time balances
 * (remaining stock, still-with-karigar) shown for context regardless of
 * range. `reconciliationGap` is the "strict tracking" signal — near-zero
 * means everything purchased is accounted for; a real gap surfaces
 * unexplained shrinkage instead of hiding it.
 */
export async function getGoldFlowReport(range: DateRange = {}) {
  const storeId = await requireStoreScope();
  const scope = await getLocationScope();
  const fineness = await getFinenessMap(storeId);

  const purchaseItems = await prisma.purchaseItem.findMany({
    where: {
      purchase: { storeId, ...locationWhere(scope), ...toDateRangeWhere(range, "purchaseDate") },
    },
    include: { purchase: { select: { purchaseDate: true } } },
  });

  const purchasedFine = purchaseItems.reduce(
    (sum, item) => sum + toFineWeight(Number(item.netWeight ?? 0), item.purity, fineness),
    0,
  );

  const itemsCreatedFromPurchaseCount = purchaseItems.filter(
    (item) => item.inventoryStockId !== null,
  ).length;

  const issuedAgg = await prisma.karigarJob.aggregate({
    where: { storeId, ...locationWhere(scope), ...toDateRangeWhere(range, "issueDate") },
    _sum: { issueFineWeight: true },
  });
  const issuedToKarigarFine = Number(issuedAgg._sum.issueFineWeight ?? 0);

  const receivedAgg = await prisma.karigarJob.aggregate({
    where: {
      storeId,
      receivedDate: { not: null },
      ...locationWhere(scope),
      ...toDateRangeWhere(range, "receivedDate"),
    },
    _sum: { receiveFineWeight: true },
  });
  const receivedFromKarigarFine = Number(receivedAgg._sum.receiveFineWeight ?? 0);

  const karigarReceiptItems = await prisma.karigarReceiptItem.findMany({
    where: {
      karigarJob: { storeId, ...locationWhere(scope) },
      ...toDateRangeWhere(range, "createdAt"),
    },
  });

  const wastageFine = karigarReceiptItems.reduce(
    (sum, item) =>
      sum + Number(item.fineWeight) * (Number(item.wastagePercent ?? 0) / 100),
    0,
  );
  const itemsCreatedFromKarigarCount = karigarReceiptItems.length;

  const [invoiceItems, kachaInvoiceItems] = await Promise.all([
    prisma.invoiceItem.findMany({
      where: {
        invoice: { storeId, ...locationWhere(scope), ...toDateRangeWhere(range, "invoiceDate") },
      },
      include: { inventoryStock: { select: { purity: true } } },
    }),
    prisma.kachaInvoiceItem.findMany({
      where: {
        kachaInvoice: {
          storeId,
          ...locationWhere(scope),
          ...toDateRangeWhere(range, "invoiceDate"),
        },
      },
      include: { inventoryStock: { select: { purity: true } } },
    }),
  ]);

  const soldFine =
    invoiceItems.reduce(
      (sum, item) =>
        sum +
        toFineWeight(
          Number(item.netWeight ?? 0),
          item.purity ?? item.inventoryStock?.purity ?? null,
          fineness,
        ),
      0,
    ) +
    kachaInvoiceItems.reduce(
      (sum, item) =>
        sum +
        toFineWeight(
          Number(item.netWeight ?? 0),
          item.purity ?? item.inventoryStock?.purity ?? null,
          fineness,
        ),
      0,
    );

  const itemsSoldCount =
    invoiceItems.filter((item) => item.inventoryStockId !== null).length +
    kachaInvoiceItems.filter((item) => item.inventoryStockId !== null).length;

  const remainingStock = await prisma.inventoryStock.findMany({
    where: {
      storeId,
      status: { in: [InventoryStockStatus.IN_STOCK, InventoryStockStatus.RESERVED] },
      ...locationWhere(scope),
    },
    select: { netWeight: true, purity: true },
  });
  const remainingStockFine = remainingStock.reduce(
    (sum, stock) => sum + toFineWeight(Number(stock.netWeight ?? 0), stock.purity, fineness),
    0,
  );

  const withKarigarAgg = await prisma.karigarJob.aggregate({
    where: { storeId, receivedDate: null, ...locationWhere(scope) },
    _sum: { issueFineWeight: true },
  });
  const withKarigarFine = Number(withKarigarAgg._sum.issueFineWeight ?? 0);

  const itemsRemainingCount = await prisma.inventoryStock.count({
    where: { storeId, status: InventoryStockStatus.IN_STOCK, ...locationWhere(scope) },
  });

  const itemsCreatedCount = itemsCreatedFromPurchaseCount + itemsCreatedFromKarigarCount;

  const reconciliationGap =
    Math.round(
      (purchasedFine - soldFine - wastageFine - remainingStockFine - withKarigarFine) * 1000,
    ) / 1000;

  return {
    purchasedFine,
    issuedToKarigarFine,
    receivedFromKarigarFine,
    wastageFine,
    soldFine,
    remainingStockFine,
    withKarigarFine,
    itemsSoldCount,
    itemsCreatedCount,
    itemsRemainingCount,
    reconciliationGap,
  };
}

type MetalWiseRow = {
  metalId: string;
  metalName: string;
  purchasedCount: number;
  purchasedWeight: number;
  purchasedAmount: number;
  soldCount: number;
  soldWeight: number;
  soldAmount: number;
  inStockCount: number;
  inStockWeight: number;
  inStockValue: number;
  withKarigarWeight: number;
  reconciliationGap: number;
};

function emptyMetalWiseRow(metalId: string, metalName: string): MetalWiseRow {
  return {
    metalId,
    metalName,
    purchasedCount: 0,
    purchasedWeight: 0,
    purchasedAmount: 0,
    soldCount: 0,
    soldWeight: 0,
    soldAmount: 0,
    inStockCount: 0,
    inStockWeight: 0,
    inStockValue: 0,
    withKarigarWeight: 0,
    reconciliationGap: 0,
  };
}

/**
 * Per-metal status — purchased/sold/in-stock/with-karigar, in raw weight
 * (not fine-weight; unlike getGoldFlowReport this must also work for
 * non-purity metals like Diamond). Rows come from whatever `StoreMetal`
 * rows the store actually has, so adding a new metal in Settings makes it
 * appear here automatically on the next load — nothing here is hardcoded
 * to Gold/Silver. Purchased/sold are date-ranged; in-stock/with-karigar
 * are point-in-time (current), same convention as getGoldFlowReport.
 */
export async function getMetalWiseReport(range: DateRange = {}) {
  const storeId = await requireStoreScope();
  const scope = await getLocationScope();

  const metals = await prisma.storeMetal.findMany({
    where: { storeId, isActive: true },
    orderBy: { name: "asc" },
  });

  const [purchaseItems, invoiceItems, kachaInvoiceItems, stockRows, openKarigarJobs] =
    await Promise.all([
      prisma.purchaseItem.findMany({
        where: {
          purchase: { storeId, ...locationWhere(scope), ...toDateRangeWhere(range, "purchaseDate") },
        },
        select: { metalTypeId: true, netWeight: true, lineTotal: true },
      }),
      prisma.invoiceItem.findMany({
        where: {
          invoice: { storeId, ...locationWhere(scope), ...toDateRangeWhere(range, "invoiceDate") },
        },
        select: { metalTypeId: true, netWeight: true, lineTotal: true },
      }),
      prisma.kachaInvoiceItem.findMany({
        where: {
          kachaInvoice: {
            storeId,
            ...locationWhere(scope),
            ...toDateRangeWhere(range, "invoiceDate"),
          },
        },
        select: { metalTypeId: true, netWeight: true, lineTotal: true },
      }),
      prisma.inventoryStock.findMany({
        where: {
          storeId,
          status: { in: [InventoryStockStatus.IN_STOCK, InventoryStockStatus.RESERVED] },
          ...locationWhere(scope),
        },
        select: {
          metalTypeId: true,
          netWeight: true,
          saleRate: true,
          quantity: true,
          purchaseAmount: true,
        },
      }),
      prisma.karigarJob.findMany({
        where: { storeId, receivedDate: null, ...locationWhere(scope) },
        select: { metalTypeId: true, issueWeight: true },
      }),
    ]);

  const byMetal = new Map<string, MetalWiseRow>(
    metals.map((metal) => [metal.id, emptyMetalWiseRow(metal.id, metal.name)]),
  );

  function getRow(metalTypeId: string | null) {
    const key = metalTypeId ?? "unassigned";
    let row = byMetal.get(key);
    if (!row) {
      row = emptyMetalWiseRow(key, metalTypeId ? "Unknown Metal" : "Unassigned");
      byMetal.set(key, row);
    }
    return row;
  }

  for (const item of purchaseItems) {
    const row = getRow(item.metalTypeId);
    row.purchasedCount += 1;
    row.purchasedWeight += Number(item.netWeight ?? 0);
    row.purchasedAmount += Number(item.lineTotal ?? 0);
  }

  for (const item of [...invoiceItems, ...kachaInvoiceItems]) {
    const row = getRow(item.metalTypeId);
    row.soldCount += 1;
    row.soldWeight += Number(item.netWeight ?? 0);
    row.soldAmount += Number(item.lineTotal ?? 0);
  }

  for (const stock of stockRows) {
    const row = getRow(stock.metalTypeId);
    row.inStockCount += 1;
    row.inStockWeight += Number(stock.netWeight ?? 0);
    row.inStockValue += stock.saleRate
      ? Number(stock.saleRate) * stock.quantity
      : Number(stock.purchaseAmount ?? 0);
  }

  for (const job of openKarigarJobs) {
    const row = getRow(job.metalTypeId);
    row.withKarigarWeight += Number(job.issueWeight ?? 0);
  }

  for (const row of byMetal.values()) {
    row.reconciliationGap =
      Math.round(
        (row.purchasedWeight - row.soldWeight - row.inStockWeight - row.withKarigarWeight) *
          1000,
      ) / 1000;
  }

  return {
    metals: Array.from(byMetal.values()).sort((a, b) => a.metalName.localeCompare(b.metalName)),
  };
}

export type SalesByUserRow = {
  userId: string | null;
  name: string;
  invoiceCount: number;
  totalRevenue: number;
  totalCollected: number;
  totalOutstanding: number;
  firstSale: Date | null;
  lastSale: Date | null;
};

export type SalesByUserReport = {
  rows: SalesByUserRow[];
  totalRevenue: number;
  invoiceCount: number;
  /** Invoices raised before the seller was recorded — see the null row. */
  unattributedCount: number;
};

/**
 * Who sold what.
 *
 * Grouped on the invoice's recorded seller rather than on a join, because
 * the name is snapshotted at the sale: staff leave, and the report still has
 * to attribute their sales rather than dropping or renaming them.
 *
 * Invoices raised before the seller was recorded collect under a single
 * "Not recorded" row instead of being left out — a revenue report whose rows
 * do not sum to the total is worse than one that admits the gap.
 */
export async function getSalesByUserReport(range: DateRange = {}) {
  const storeId = await requireStoreScope();
  const scope = await getLocationScope();

  const invoices = await prisma.invoice.findMany({
    where: {
      storeId,
      ...locationWhere(scope),
      ...toDateRangeWhere(range, "invoiceDate"),
    },
    select: {
      invoiceDate: true,
      totalAmount: true,
      paidAmount: true,
      balanceAmount: true,
      createdById: true,
      createdByName: true,
      createdBy: { select: { name: true, email: true } },
    },
  });

  const byUser = new Map<string, SalesByUserRow>();

  for (const invoice of invoices) {
    const key = invoice.createdById ?? "__unrecorded__";

    // The snapshot first, the live user second: a renamed account should not
    // silently rewrite who an old invoice says sold the piece.
    const name =
      invoice.createdByName ??
      invoice.createdBy?.name ??
      invoice.createdBy?.email ??
      "Not recorded";

    const row =
      byUser.get(key) ??
      ({
        userId: invoice.createdById,
        name,
        invoiceCount: 0,
        totalRevenue: 0,
        totalCollected: 0,
        totalOutstanding: 0,
        firstSale: null,
        lastSale: null,
      } satisfies SalesByUserRow);

    row.invoiceCount += 1;
    row.totalRevenue += Number(invoice.totalAmount);
    row.totalCollected += Number(invoice.paidAmount);
    row.totalOutstanding += Number(invoice.balanceAmount);

    if (!row.firstSale || invoice.invoiceDate < row.firstSale) {
      row.firstSale = invoice.invoiceDate;
    }
    if (!row.lastSale || invoice.invoiceDate > row.lastSale) {
      row.lastSale = invoice.invoiceDate;
    }

    byUser.set(key, row);
  }

  const rows = [...byUser.values()].sort(
    (a, b) => b.totalRevenue - a.totalRevenue,
  );

  return {
    rows,
    totalRevenue: rows.reduce((sum, row) => sum + row.totalRevenue, 0),
    invoiceCount: invoices.length,
    unattributedCount:
      byUser.get("__unrecorded__")?.invoiceCount ?? 0,
  } satisfies SalesByUserReport;
}

export type ItemLedgerEvent = { date: string; label: string };

export type ItemLedgerRow = {
  stockId: string;
  stockCode: string;
  productName: string;
  status: string;
  quantityRemaining: number;
  netWeight: number;
  purchaseDate: string | null;
  purchaseQuantity: number | null;
  vendorName: string | null;
  // No staff-attribution column exists on Purchase today — always "Not
  // recorded" until that's added, kept visible rather than dropped so the
  // gap is honest instead of silently missing.
  purchasedBy: string;
  totalSoldQuantity: number;
  lastSaleDate: string | null;
  soldTo: string;
  soldBy: string;
  history: ItemLedgerEvent[];
};

export type ItemLedgerReport = {
  rows: ItemLedgerRow[];
  itemCount: number;
};

// Lifecycle events with no other record on the item's timeline (a sale or a
// karigar receipt is already captured from its own table, with better
// detail than this generic log carries).
const NOTABLE_TRANSACTION_TYPES: InventoryTransactionType[] = [
  InventoryTransactionType.DAMAGE,
  InventoryTransactionType.RESERVE,
  InventoryTransactionType.UNRESERVE,
];

function transactionTypeLabel(type: InventoryTransactionType) {
  return type
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Full purchase-to-sale history per inventory item: when it was bought and
 * from whom, when (and to whom, by whom) it sold, and every step in between.
 *
 * "Purchased by" (which staff member logged the purchase) cannot be
 * populated — Purchase has no createdBy field yet, unlike Invoice — so that
 * column always reads "Not recorded" rather than being silently omitted.
 */
export async function getItemLedgerReport(): Promise<ItemLedgerReport> {
  const storeId = await requireStoreScope();
  const scope = await getLocationScope();

  const stockItems = await prisma.inventoryStock.findMany({
    where: { storeId, ...locationWhere(scope) },
    orderBy: { createdAt: "desc" },
    include: {
      product: { select: { name: true } },
      purchaseItems: { select: { quantity: true } },
      invoiceItems: {
        select: {
          quantity: true,
          invoice: {
            select: {
              invoiceNumber: true,
              invoiceDate: true,
              createdByName: true,
              customer: { select: { name: true } },
            },
          },
        },
      },
      kachaInvoiceItems: {
        select: {
          quantity: true,
          kachaInvoice: {
            select: {
              slipNumber: true,
              invoiceDate: true,
              customer: { select: { name: true } },
            },
          },
        },
      },
      karigarJobs: {
        select: {
          issueDate: true,
          receivedDate: true,
          karigar: { select: { name: true } },
        },
      },
      transactions: {
        select: { transactionType: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const rows: ItemLedgerRow[] = stockItems.map((stock) => {
    const events: { date: Date; label: string }[] = [];

    const purchaseQuantity =
      stock.purchaseItems.reduce((sum, item) => sum + item.quantity, 0) || null;

    if (stock.purchaseDate) {
      events.push({
        date: stock.purchaseDate,
        label: `Purchased${purchaseQuantity ? ` (Qty ${purchaseQuantity})` : ""} from ${
          stock.vendorName ?? "Unknown vendor"
        }`,
      });
    }

    for (const job of stock.karigarJobs) {
      events.push({
        date: job.issueDate,
        label: `Issued to Karigar ${job.karigar.name}`,
      });
      if (job.receivedDate) {
        events.push({
          date: job.receivedDate,
          label: `Received from Karigar ${job.karigar.name}`,
        });
      }
    }

    const soldToNames = new Set<string>();
    const soldByNames = new Set<string>();
    let totalSoldQuantity = 0;
    let lastSaleDate: Date | null = null;

    for (const item of stock.invoiceItems) {
      totalSoldQuantity += item.quantity;
      soldToNames.add(item.invoice.customer.name);
      if (item.invoice.createdByName) soldByNames.add(item.invoice.createdByName);
      if (!lastSaleDate || item.invoice.invoiceDate > lastSaleDate) {
        lastSaleDate = item.invoice.invoiceDate;
      }
      events.push({
        date: item.invoice.invoiceDate,
        label: `Sold (Qty ${item.quantity}) to ${item.invoice.customer.name} — Invoice ${
          item.invoice.invoiceNumber
        }${item.invoice.createdByName ? ` by ${item.invoice.createdByName}` : ""}`,
      });
    }

    for (const item of stock.kachaInvoiceItems) {
      totalSoldQuantity += item.quantity;
      soldToNames.add(item.kachaInvoice.customer.name);
      if (!lastSaleDate || item.kachaInvoice.invoiceDate > lastSaleDate) {
        lastSaleDate = item.kachaInvoice.invoiceDate;
      }
      events.push({
        date: item.kachaInvoice.invoiceDate,
        label: `Sold (Qty ${item.quantity}) to ${item.kachaInvoice.customer.name} — Kacha Slip ${item.kachaInvoice.slipNumber}`,
      });
    }

    for (const txn of stock.transactions) {
      if (NOTABLE_TRANSACTION_TYPES.includes(txn.transactionType)) {
        events.push({
          date: txn.createdAt,
          label: transactionTypeLabel(txn.transactionType),
        });
      }
    }

    events.sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
      stockId: stock.id,
      stockCode: stock.stockCode,
      productName: stock.product.name,
      status: stock.status,
      quantityRemaining: stock.quantity,
      netWeight: stock.netWeight ? Number(stock.netWeight) : 0,
      purchaseDate: stock.purchaseDate ? stock.purchaseDate.toISOString() : null,
      purchaseQuantity,
      vendorName: stock.vendorName,
      purchasedBy: "Not recorded",
      totalSoldQuantity,
      lastSaleDate: lastSaleDate ? (lastSaleDate as Date).toISOString() : null,
      soldTo: soldToNames.size ? Array.from(soldToNames).join(", ") : "-",
      soldBy: soldByNames.size
        ? Array.from(soldByNames).join(", ")
        : totalSoldQuantity > 0
          ? "Not recorded"
          : "-",
      history: events.map((event) => ({
        date: event.date.toISOString(),
        label: event.label,
      })),
    };
  });

  return { rows, itemCount: rows.length };
}
