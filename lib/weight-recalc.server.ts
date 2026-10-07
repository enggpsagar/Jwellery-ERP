// Settings > Weights: "safe recalculation" of a store's existing records
// after its weight settings change (lib/weight-calc.ts is the calculator,
// lib/fine-weight.ts the resolver).
//
// What changes, ONLY for the store being acted on:
//   - FINE weight on every record that stores one: PieceComponent (metal
//     rows) → InventoryStock, PurchaseItem, InvoiceItem, KachaInvoiceItem,
//     QuotationItem (a multi-part parent = its first metal's rows) → the
//     "Stock added" LedgerEntry.metalWeightFine of a piece (Add Stock /
//     stock import), which is the only ledger figure worked out from these
//     settings (karigar issue / receipt entries have their own rules and
//     are untouched).
//   - NET weight only where it was worked out from gross and nothing has
//     been sold, issued or paid against it:
//       * unsold stock — IN_STOCK, not on any invoice / estimate / artisan
//         job (the same lock updateInventoryStock uses), single piece;
//       * lines of unpaid, unconverted estimates (KachaInvoice status DRAFT
//         = nothing paid, convertedToId null) and open quotations (status
//         "open", convertedToId null), not linked to a stock piece;
//     and only when the stored net equals what the OLD settings derive from
//     its gross (i.e. it was calculated, not typed).
//   - NEVER: net weight, amounts or GST of invoices, purchases, credit
//     notes or anything paid / converted; no amount anywhere is re-priced.
//
// Resumable: the run's state lives in BusinessSettings.weightRecalcJob and
// advances BATCH_SIZE rows per call, each call one transaction that also
// moves the cursor (row-locked, so two tabs can't double-process). The
// client calls continueWeightRecalculation in a loop with a progress bar;
// a closed tab resumes from the cursor. Finished runs are appended to
// BusinessSettings.weightRecalcLog (this app has no activity table).
import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getFineWeightResolver, type FineWeightResolver } from "@/lib/fine-weight";
import { deriveNetWeight, fineDecimals, netDecimals, type WeightSettings } from "@/lib/weight-calc";

export const RECALC_BATCH_SIZE = 500;

export const RECALC_PHASES = [
  "pieceComponent",
  "inventoryStock",
  "purchaseItem",
  "invoiceItem",
  "kachaInvoiceItem",
  "quotationItem",
  "ledgerEntry",
] as const;
export type RecalcPhase = (typeof RECALC_PHASES)[number];

export const RECALC_PHASE_LABELS: Record<RecalcPhase, string> = {
  pieceComponent: "Metal rows of multi-part pieces",
  inventoryStock: "Stock pieces",
  purchaseItem: "Purchase lines",
  invoiceItem: "Invoice lines",
  kachaInvoiceItem: "Estimate lines",
  quotationItem: "Quotation lines",
  ledgerEntry: "Stock-added ledger entries",
};

export type RecalcCounts = Record<RecalcPhase, { fine: number; net: number }>;

export type WeightRecalcJob = {
  id: string;
  startedAt: string;
  startedBy: string | null;
  from: WeightSettings;
  to: WeightSettings;
  phase: RecalcPhase;
  cursor: string | null;
  /** Rows looked at / changed so far. */
  scanned: number;
  changed: RecalcCounts;
  /** The dry-run totals, for the progress bar. */
  totals: RecalcScope;
};

export type WeightRecalcLogEntry = {
  id: string;
  at: string;
  by: string | null;
  from: WeightSettings;
  to: WeightSettings;
  changed: RecalcCounts | null;
  note: string;
};

/** Rows each phase will look at, and of them the ones whose net may change. */
export type RecalcScope = Record<RecalcPhase, { rows: number; netEligible: number }>;

const ZERO_COUNTS = (): RecalcCounts =>
  Object.fromEntries(RECALC_PHASES.map((phase) => [phase, { fine: 0, net: 0 }])) as RecalcCounts;

// ---------------------------------------------------------------------------
// Which settings changes need existing records recalculated
// ---------------------------------------------------------------------------

export function netRulesChanged(from: WeightSettings, to: WeightSettings) {
  return (
    from.netDeductStoneWeight !== to.netDeductStoneWeight ||
    from.netDeductDmoWeight !== to.netDeductDmoWeight ||
    netDecimals("GRAM", from) !== netDecimals("GRAM", to)
  );
}

export function fineRulesChanged(from: WeightSettings, to: WeightSettings) {
  return (
    netRulesChanged(from, to) ||
    from.fineWeightBasis !== to.fineWeightBasis ||
    from.addWastageToFineWeight !== to.addWastageToFineWeight ||
    fineDecimals("GRAM", from) !== fineDecimals("GRAM", to) ||
    fineDecimals("CARAT", from) !== fineDecimals("CARAT", to)
  );
}

// ---------------------------------------------------------------------------
// Store-scoped row filters (every query below is filtered by storeId — the
// child tables through their parent's storeId).
// ---------------------------------------------------------------------------

function componentWhere(storeId: string): Prisma.PieceComponentWhereInput {
  return {
    kind: "METAL",
    OR: [
      { inventoryStock: { storeId } },
      { invoiceItem: { invoice: { storeId } } },
      { purchaseItem: { purchase: { storeId } } },
      { kachaInvoiceItem: { kachaInvoice: { storeId } } },
      { quotationItem: { quotation: { storeId } } },
    ],
  };
}

const unsoldStockWhere: Prisma.InventoryStockWhereInput = {
  status: "IN_STOCK",
  invoiceItems: { none: {} },
  kachaInvoiceItems: { none: {} },
  karigarJobs: { none: {} },
  components: { none: {} },
  grossWeight: { gt: 0 },
};

const draftKachaWhere: Prisma.KachaInvoiceWhereInput = { status: "DRAFT", convertedToId: null };
const openQuotationWhere: Prisma.QuotationWhereInput = { status: "open", convertedToId: null };

function stockAddedLedgerWhere(storeId: string): Prisma.LedgerEntryWhereInput {
  return {
    storeId,
    sourceType: "ADJUSTMENT",
    metalWeightFine: { not: null },
    description: { startsWith: STOCK_ADDED_PREFIX },
  };
}

const STOCK_ADDED_PREFIX = "Stock added — ";

/** "Stock added — STK-2026-0001 (Tag T1) (import)" → "STK-2026-0001". */
function stockCodeFromDescription(description: string | null) {
  if (!description?.startsWith(STOCK_ADDED_PREFIX)) return null;
  const rest = description.slice(STOCK_ADDED_PREFIX.length);
  const end = rest.indexOf(" (");
  return (end >= 0 ? rest.slice(0, end) : rest).trim() || null;
}

/** Dry run: how many rows each phase looks at (and may change the net of). */
export async function countRecalcScope(storeId: string, from: WeightSettings, to: WeightSettings): Promise<RecalcScope> {
  const net = netRulesChanged(from, to);
  const [
    components,
    stock,
    stockNet,
    purchaseItems,
    invoiceItems,
    kachaItems,
    kachaNet,
    quotationItems,
    quotationNet,
    ledger,
  ] = await Promise.all([
    prisma.pieceComponent.count({ where: componentWhere(storeId) }),
    prisma.inventoryStock.count({ where: { storeId, netWeight: { not: null } } }),
    net ? prisma.inventoryStock.count({ where: { storeId, ...unsoldStockWhere } }) : 0,
    prisma.purchaseItem.count({ where: { purchase: { storeId }, netWeight: { not: null } } }),
    prisma.invoiceItem.count({ where: { invoice: { storeId }, netWeight: { not: null } } }),
    prisma.kachaInvoiceItem.count({ where: { kachaInvoice: { storeId }, netWeight: { not: null } } }),
    net
      ? prisma.kachaInvoiceItem.count({
          where: { kachaInvoice: { storeId, ...draftKachaWhere }, inventoryStockId: null, grossWeight: { gt: 0 } },
        })
      : 0,
    prisma.quotationItem.count({ where: { quotation: { storeId }, netWeight: { not: null } } }),
    net
      ? prisma.quotationItem.count({
          where: { quotation: { storeId, ...openQuotationWhere }, inventoryStockId: null, grossWeight: { gt: 0 } },
        })
      : 0,
    prisma.ledgerEntry.count({ where: stockAddedLedgerWhere(storeId) }),
  ]);
  return {
    pieceComponent: { rows: components, netEligible: 0 },
    inventoryStock: { rows: stock, netEligible: stockNet },
    purchaseItem: { rows: purchaseItems, netEligible: 0 },
    invoiceItem: { rows: invoiceItems, netEligible: 0 },
    kachaInvoiceItem: { rows: kachaItems, netEligible: kachaNet },
    quotationItem: { rows: quotationItems, netEligible: quotationNet },
    ledgerEntry: { rows: ledger, netEligible: 0 },
  };
}

export function scopeTotal(scope: RecalcScope) {
  return RECALC_PHASES.reduce((sum, phase) => sum + scope[phase].rows, 0);
}

export function newRecalcJob(params: {
  from: WeightSettings;
  to: WeightSettings;
  startedBy: string | null;
  totals: RecalcScope;
}): WeightRecalcJob {
  return {
    id: `wr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    startedAt: new Date().toISOString(),
    startedBy: params.startedBy,
    from: params.from,
    to: params.to,
    phase: RECALC_PHASES[0],
    cursor: null,
    scanned: 0,
    changed: ZERO_COUNTS(),
    totals: params.totals,
  };
}

// ---------------------------------------------------------------------------
// One batch
// ---------------------------------------------------------------------------

type Num = Prisma.Decimal | number | null | undefined;
const asNum = (value: Num) => (value == null ? null : Number(value));
const differs = (a: Num, b: number | null) => {
  const x = asNum(a);
  if (x === null || b === null) return x !== b;
  return Math.abs(x - b) > 0.000001;
};

type ComponentRow = {
  kind: string;
  sortOrder: number;
  metalTypeId: string | null;
  fineWeight: Prisma.Decimal | null;
};

/** A multi-part parent's fine weight: its first metal's rows (PieceComponent's doc). */
function parentFineFromComponents(components: ComponentRow[]): number | null {
  const metals = components.filter((row) => row.kind === "METAL").sort((a, b) => a.sortOrder - b.sortOrder);
  if (!metals.length) return null;
  const first = metals[0].metalTypeId;
  const sum = metals
    .filter((row) => row.metalTypeId === first)
    .reduce((acc, row) => acc + (asNum(row.fineWeight) ?? 0), 0);
  return Math.round(sum * 100000) / 100000;
}

/** Was this net worked out from gross under `settings` (vs typed)? */
function isDerivedNet(
  row: { grossWeight: Num; netWeight: Num; stoneWeight?: Num; dmoWeight?: Num; lessWeight?: Num },
  settings: WeightSettings,
) {
  const derived = deriveNetWeight(
    { grossWeight: asNum(row.grossWeight), stoneWeight: asNum(row.stoneWeight ?? null), dmoWeight: asNum(row.dmoWeight ?? null), lessWeight: asNum(row.lessWeight ?? null) },
    settings,
  );
  const net = asNum(row.netWeight);
  return derived !== null && net !== null && Math.abs(derived - net) < 0.0005;
}

type Tx = Prisma.TransactionClient;

type BatchContext = {
  storeId: string;
  job: WeightRecalcJob;
  fineOf: FineWeightResolver;
  netChange: boolean;
  gemstoneIds: Set<string>;
};

type BatchResult = { lastId: string | null; scanned: number; fine: number; net: number };

const batchArgs = (cursor: string | null) => ({
  orderBy: { id: "asc" as const },
  take: RECALC_BATCH_SIZE,
  ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
});

async function runComponents(tx: Tx, ctx: BatchContext): Promise<BatchResult> {
  const rows = await tx.pieceComponent.findMany({
    where: componentWhere(ctx.storeId),
    select: {
      id: true,
      metalTypeId: true,
      purity: true,
      purityLabel: true,
      grossWeight: true,
      netWeight: true,
      fineWeight: true,
      wastagePercent: true,
    },
    ...batchArgs(ctx.job.cursor),
  });
  let fine = 0;
  for (const row of rows) {
    const next = ctx.fineOf({ ...row, wastagePercent: row.wastagePercent ?? null });
    if (next !== null && differs(row.fineWeight, next)) {
      await tx.pieceComponent.update({ where: { id: row.id }, data: { fineWeight: next } });
      fine++;
    }
  }
  return { lastId: rows.at(-1)?.id ?? null, scanned: rows.length, fine, net: 0 };
}

const componentSelect = {
  where: { kind: "METAL" as const },
  select: { kind: true, sortOrder: true, metalTypeId: true, fineWeight: true },
};

async function runStock(tx: Tx, ctx: BatchContext): Promise<BatchResult> {
  const rows = await tx.inventoryStock.findMany({
    where: { storeId: ctx.storeId },
    select: {
      id: true,
      status: true,
      metalTypeId: true,
      purity: true,
      purityLabel: true,
      grossWeight: true,
      netWeight: true,
      fineWeight: true,
      stoneWeight: true,
      dmoWeight: true,
      lessWeight: true,
      wastagePercent: true,
      components: componentSelect,
      _count: { select: { invoiceItems: true, kachaInvoiceItems: true, karigarJobs: true } },
    },
    ...batchArgs(ctx.job.cursor),
  });
  let fine = 0;
  let net = 0;
  for (const row of rows) {
    if (row.components.length) {
      const next = parentFineFromComponents(row.components);
      if (next !== null && differs(row.fineWeight, next)) {
        await tx.inventoryStock.update({ where: { id: row.id }, data: { fineWeight: next } });
        fine++;
      }
      continue;
    }
    if (row.netWeight === null) continue;
    let netWeight = asNum(row.netWeight);
    const unsold =
      row.status === "IN_STOCK" &&
      row._count.invoiceItems === 0 &&
      row._count.kachaInvoiceItems === 0 &&
      row._count.karigarJobs === 0;
    const data: Prisma.InventoryStockUpdateInput = {};
    if (
      ctx.netChange &&
      unsold &&
      (asNum(row.grossWeight) ?? 0) > 0 &&
      !(row.metalTypeId && ctx.gemstoneIds.has(row.metalTypeId)) &&
      isDerivedNet(row, ctx.job.from)
    ) {
      const next = ctx.fineOf.deriveNet({
        grossWeight: asNum(row.grossWeight),
        stoneWeight: asNum(row.stoneWeight),
        dmoWeight: asNum(row.dmoWeight),
        lessWeight: asNum(row.lessWeight),
      });
      if (next !== null && differs(row.netWeight, next)) {
        data.netWeight = next;
        netWeight = next;
        net++;
      }
    }
    const nextFine = ctx.fineOf({ ...row, netWeight, wastagePercent: row.wastagePercent ?? null });
    if (nextFine !== null && differs(row.fineWeight, nextFine)) {
      data.fineWeight = nextFine;
      fine++;
    }
    if (Object.keys(data).length) await tx.inventoryStock.update({ where: { id: row.id }, data });
  }
  return { lastId: rows.at(-1)?.id ?? null, scanned: rows.length, fine, net };
}

const lineSelect = {
  id: true,
  metalTypeId: true,
  purity: true,
  purityLabel: true,
  grossWeight: true,
  netWeight: true,
  fineWeight: true,
  stoneWeight: true,
  dmoWeight: true,
  wastagePercent: true,
  inventoryStockId: true,
  components: componentSelect,
} as const;

type LineRow = {
  id: string;
  metalTypeId: string | null;
  purity: string | null;
  purityLabel: string | null;
  grossWeight: Prisma.Decimal | null;
  netWeight: Prisma.Decimal | null;
  fineWeight: Prisma.Decimal | null;
  stoneWeight: Prisma.Decimal | null;
  dmoWeight: Prisma.Decimal | null;
  wastagePercent: Prisma.Decimal | null;
  inventoryStockId: string | null;
  components: ComponentRow[];
};

/** A line's new { fineWeight?, netWeight? } (net only when `netAllowed`). */
function lineUpdate(row: LineRow, ctx: BatchContext, netAllowed: boolean) {
  if (row.components.length) {
    const next = parentFineFromComponents(row.components);
    return next !== null && differs(row.fineWeight, next) ? { fineWeight: next } : {};
  }
  if (row.netWeight === null) return {};
  const data: { fineWeight?: number; netWeight?: number } = {};
  let netWeight = asNum(row.netWeight);
  if (
    netAllowed &&
    ctx.netChange &&
    !row.inventoryStockId &&
    (asNum(row.grossWeight) ?? 0) > 0 &&
    !(row.metalTypeId && ctx.gemstoneIds.has(row.metalTypeId)) &&
    isDerivedNet(row, ctx.job.from)
  ) {
    const next = ctx.fineOf.deriveNet({
      grossWeight: asNum(row.grossWeight),
      stoneWeight: asNum(row.stoneWeight),
      dmoWeight: asNum(row.dmoWeight),
    });
    if (next !== null && differs(row.netWeight, next)) {
      data.netWeight = next;
      netWeight = next;
    }
  }
  const nextFine = ctx.fineOf({ ...row, netWeight, wastagePercent: row.wastagePercent ?? null });
  if (nextFine !== null && differs(row.fineWeight, nextFine)) data.fineWeight = nextFine;
  return data;
}

async function runPurchaseItems(tx: Tx, ctx: BatchContext): Promise<BatchResult> {
  const rows = await tx.purchaseItem.findMany({
    where: { purchase: { storeId: ctx.storeId } },
    select: lineSelect,
    ...batchArgs(ctx.job.cursor),
  });
  let fine = 0;
  for (const row of rows) {
    // Fine only — a purchase's net weight and amounts are never changed.
    const data = lineUpdate(row as LineRow, ctx, false);
    if (data.fineWeight !== undefined) {
      await tx.purchaseItem.update({ where: { id: row.id }, data: { fineWeight: data.fineWeight } });
      fine++;
    }
  }
  return { lastId: rows.at(-1)?.id ?? null, scanned: rows.length, fine, net: 0 };
}

async function runInvoiceItems(tx: Tx, ctx: BatchContext): Promise<BatchResult> {
  const rows = await tx.invoiceItem.findMany({
    where: { invoice: { storeId: ctx.storeId } },
    select: lineSelect,
    ...batchArgs(ctx.job.cursor),
  });
  let fine = 0;
  for (const row of rows) {
    // Fine only — an issued invoice's net weight, amounts and GST stay.
    const data = lineUpdate(row as LineRow, ctx, false);
    if (data.fineWeight !== undefined) {
      await tx.invoiceItem.update({ where: { id: row.id }, data: { fineWeight: data.fineWeight } });
      fine++;
    }
  }
  return { lastId: rows.at(-1)?.id ?? null, scanned: rows.length, fine, net: 0 };
}

async function runKachaItems(tx: Tx, ctx: BatchContext): Promise<BatchResult> {
  const rows = await tx.kachaInvoiceItem.findMany({
    where: { kachaInvoice: { storeId: ctx.storeId } },
    select: { ...lineSelect, kachaInvoice: { select: { status: true, convertedToId: true } } },
    ...batchArgs(ctx.job.cursor),
  });
  let fine = 0;
  let net = 0;
  for (const row of rows) {
    const draft = row.kachaInvoice.status === "DRAFT" && !row.kachaInvoice.convertedToId;
    const data = lineUpdate(row as unknown as LineRow, ctx, draft);
    if (!Object.keys(data).length) continue;
    await tx.kachaInvoiceItem.update({ where: { id: row.id }, data });
    if (data.fineWeight !== undefined) fine++;
    if (data.netWeight !== undefined) net++;
  }
  return { lastId: rows.at(-1)?.id ?? null, scanned: rows.length, fine, net };
}

async function runQuotationItems(tx: Tx, ctx: BatchContext): Promise<BatchResult> {
  const rows = await tx.quotationItem.findMany({
    where: { quotation: { storeId: ctx.storeId } },
    select: {
      id: true,
      metalTypeId: true,
      purity: true,
      purityLabel: true,
      grossWeight: true,
      netWeight: true,
      fineWeight: true,
      stoneWeight: true,
      wastagePercent: true,
      inventoryStockId: true,
      components: componentSelect,
      quotation: { select: { status: true, convertedToId: true } },
    },
    ...batchArgs(ctx.job.cursor),
  });
  let fine = 0;
  let net = 0;
  for (const row of rows) {
    const open = row.quotation.status === "open" && !row.quotation.convertedToId;
    const data = lineUpdate({ ...row, dmoWeight: null } as unknown as LineRow, ctx, open);
    if (!Object.keys(data).length) continue;
    await tx.quotationItem.update({ where: { id: row.id }, data });
    if (data.fineWeight !== undefined) fine++;
    if (data.netWeight !== undefined) net++;
  }
  return { lastId: rows.at(-1)?.id ?? null, scanned: rows.length, fine, net };
}

async function runLedger(tx: Tx, ctx: BatchContext): Promise<BatchResult> {
  const rows = await tx.ledgerEntry.findMany({
    where: stockAddedLedgerWhere(ctx.storeId),
    select: { id: true, description: true, metalTypeId: true, metalWeightFine: true },
    ...batchArgs(ctx.job.cursor),
  });
  const codes = [...new Set(rows.map((row) => stockCodeFromDescription(row.description)).filter(Boolean))] as string[];
  const stocks = codes.length
    ? await tx.inventoryStock.findMany({
        where: { storeId: ctx.storeId, stockCode: { in: codes } },
        select: { stockCode: true, metalTypeId: true, fineWeight: true, components: componentSelect },
      })
    : [];
  const stockByCode = new Map(stocks.map((stock) => [stock.stockCode, stock]));
  let fine = 0;
  for (const row of rows) {
    const code = stockCodeFromDescription(row.description);
    const stock = code ? stockByCode.get(code) : undefined;
    if (!stock || !row.metalTypeId) continue;
    let next: number | null = null;
    if (stock.components.length) {
      const metalRows = stock.components.filter((component) => component.metalTypeId === row.metalTypeId);
      if (metalRows.length) {
        next = Math.round(metalRows.reduce((acc, component) => acc + (asNum(component.fineWeight) ?? 0), 0) * 100000) / 100000;
      }
    } else if (stock.metalTypeId === row.metalTypeId) {
      next = asNum(stock.fineWeight);
    }
    if (next !== null && next > 0 && differs(row.metalWeightFine, next)) {
      await tx.ledgerEntry.update({ where: { id: row.id }, data: { metalWeightFine: next } });
      fine++;
    }
  }
  return { lastId: rows.at(-1)?.id ?? null, scanned: rows.length, fine, net: 0 };
}

const RUNNERS: Record<RecalcPhase, (tx: Tx, ctx: BatchContext) => Promise<BatchResult>> = {
  pieceComponent: runComponents,
  inventoryStock: runStock,
  purchaseItem: runPurchaseItems,
  invoiceItem: runInvoiceItems,
  kachaInvoiceItem: runKachaItems,
  quotationItem: runQuotationItems,
  ledgerEntry: runLedger,
};

export function readRecalcJob(value: Prisma.JsonValue | null): WeightRecalcJob | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const job = value as unknown as WeightRecalcJob;
  return job.id && RECALC_PHASES.includes(job.phase) ? job : null;
}

export function readRecalcLog(value: Prisma.JsonValue | null): WeightRecalcLogEntry[] {
  return Array.isArray(value) ? (value as unknown as WeightRecalcLogEntry[]) : [];
}

export const RECALC_LOG_LIMIT = 20;

/**
 * Runs one batch of the store's in-progress job (one transaction: the rows
 * and the job's cursor move together). Returns the job after the batch, or
 * `done` with the log entry once every phase is through.
 */
export async function runRecalcBatch(
  storeId: string,
  jobId: string,
): Promise<{ status: "missing" } | { status: "running"; job: WeightRecalcJob } | { status: "done"; entry: WeightRecalcLogEntry }> {
  // Loaded outside the transaction (getFinenessMap may lazily seed rows).
  const settingsRow = await prisma.businessSettings.findUnique({ where: { storeId }, select: { weightRecalcJob: true } });
  const preview = readRecalcJob(settingsRow?.weightRecalcJob ?? null);
  if (!preview || preview.id !== jobId) return { status: "missing" };
  const [fineOf, gemstones] = await Promise.all([
    getFineWeightResolver(storeId, { settings: preview.to }),
    prisma.storeMetal.findMany({ where: { storeId, isGemstone: true }, select: { id: true } }),
  ]);

  return prisma.$transaction(
    async (tx) => {
      // Row lock: a second tab's call waits here, then sees the moved cursor.
      await tx.$queryRaw`SELECT "storeId" FROM "BusinessSettings" WHERE "storeId" = ${storeId} FOR UPDATE`;
      const row = await tx.businessSettings.findUnique({
        where: { storeId },
        select: { weightRecalcJob: true, weightRecalcLog: true },
      });
      const job = readRecalcJob(row?.weightRecalcJob ?? null);
      if (!job || job.id !== jobId) return { status: "missing" as const };

      const ctx: BatchContext = {
        storeId,
        job,
        fineOf,
        netChange: netRulesChanged(job.from, job.to),
        gemstoneIds: new Set(gemstones.map((metal) => metal.id)),
      };
      const result = await RUNNERS[job.phase](tx, ctx);
      const changed = { ...job.changed, [job.phase]: {
        fine: job.changed[job.phase].fine + result.fine,
        net: job.changed[job.phase].net + result.net,
      } };
      let next: WeightRecalcJob = { ...job, changed, scanned: job.scanned + result.scanned, cursor: result.lastId };
      if (result.scanned < RECALC_BATCH_SIZE) {
        const index = RECALC_PHASES.indexOf(job.phase);
        if (index === RECALC_PHASES.length - 1) {
          const entry: WeightRecalcLogEntry = {
            id: job.id,
            at: new Date().toISOString(),
            by: job.startedBy,
            from: job.from,
            to: job.to,
            changed,
            note: describeChanged(changed),
          };
          const log = [entry, ...readRecalcLog(row?.weightRecalcLog ?? null)].slice(0, RECALC_LOG_LIMIT);
          await tx.businessSettings.update({
            where: { storeId },
            data: { weightRecalcJob: Prisma.DbNull, weightRecalcLog: log as unknown as Prisma.InputJsonValue },
          });
          return { status: "done" as const, entry };
        }
        next = { ...next, phase: RECALC_PHASES[index + 1], cursor: null };
      }
      await tx.businessSettings.update({
        where: { storeId },
        data: { weightRecalcJob: next as unknown as Prisma.InputJsonValue },
      });
      return { status: "running" as const, job: next };
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
}

export function describeChanged(changed: RecalcCounts) {
  const parts = RECALC_PHASES.flatMap((phase) => {
    const { fine, net } = changed[phase];
    if (!fine && !net) return [];
    const bits = [fine ? `${fine} fine` : "", net ? `${net} net` : ""].filter(Boolean).join(", ");
    return [`${RECALC_PHASE_LABELS[phase]}: ${bits}`];
  });
  return parts.length ? `Recalculated — ${parts.join("; ")}.` : "Recalculated — no record needed a change.";
}
