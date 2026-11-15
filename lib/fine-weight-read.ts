// lib/fine-weight-read.ts
//
// Client-safe read side of lib/fine-weight.ts (which is server-only): every
// balance, total and report sums the stored pure-metal `fineWeight`, never
// the physical `netWeight`. A row written before fineWeight existed (or one
// the backfill missed) falls back to its netWeight — for a non-purity metal
// the two are identical anyway.

/** Prisma `select` for a row's metal PieceComponents — what fineOrNet and
 *  metalBreakdown (lib/piece-components.ts) read for a multi-metal piece. */
export const pieceMetalsSelect = {
  where: { kind: "METAL" as const },
  select: { kind: true, metalTypeId: true, netWeight: true, fineWeight: true },
};

/**
 * Pure-metal weight of a stored line/stock row: its fineWeight, falling back
 * to netWeight. A piece of several metals (selected with pieceMetalsSelect)
 * counts every metal's own pure weight — the parent's fineWeight alone is
 * only its first metal's.
 */
export function fineOrNet(row: {
  fineWeight?: unknown;
  netWeight?: unknown;
  components?: { kind: string; fineWeight?: unknown; netWeight?: unknown }[] | null;
}): number {
  const metals = (row.components ?? []).filter((component) => component.kind === "METAL");
  if (metals.length) {
    return metals.reduce((sum, component) => sum + fineOrNet({ fineWeight: component.fineWeight, netWeight: component.netWeight }), 0);
  }
  const value = row.fineWeight ?? row.netWeight;
  if (value === null || value === undefined || value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

/** Prisma `select` for every PieceComponent of a row, metals and stones —
 *  what metalBreakdown (reads METAL rows only, so it's interchangeable with
 *  pieceMetalsSelect there) and stoneBreakdown / gemstoneCarats
 *  (lib/piece-components.ts, read STONE rows) need together. */
export const piecePartsSelect = {
  select: {
    kind: true,
    metalTypeId: true,
    netWeight: true,
    fineWeight: true,
    stoneMetalTypeName: true,
    caratWeight: true,
  },
};

/** Only a row's STONE PieceComponents — for a query that must not start
 *  reading metal components it didn't read before (metalBreakdown ignores
 *  STONE rows, so the row's own metal still counts as it did). */
export const pieceStonesSelect = {
  where: { kind: "STONE" as const },
  select: { kind: true, stoneMetalTypeName: true, caratWeight: true },
};
