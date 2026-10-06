// Server side of lib/piece-components.ts: validates a piece's submitted
// metal/stone rows against the store, recomputes each row's pure weight and
// value, snapshots its GST rate, and builds the PieceComponent rows plus the
// parent line's summary fields.
import "server-only";

import { Prisma, PurityType, type PieceComponentKind } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getFineWeightResolver } from "@/lib/fine-weight";
import { round2, round5, type PieceComponentPayload, type PieceValuation } from "@/lib/piece-components";

export type ResolvedPieceComponent = {
  kind: PieceComponentKind;
  sortOrder: number;
  metalTypeId: string | null;
  metalName: string | null;
  purity: PurityType | null;
  purityLabel: string | null;
  grossWeight: number | null;
  netWeight: number | null;
  fineWeight: number | null;
  stoneMetalTypeName: string | null;
  stoneTypeNames: string | null;
  caratWeight: number | null;
  stoneWeight: number | null;
  pieces: number | null;
  clarity: string | null;
  certificateNumber: string | null;
  rate: number | null;
  amount: number;
  gstRateId: string | null;
  gstRateName: string | null;
  gstRatePercent: number | null;
};

export type ResolvedPiece = {
  components: ResolvedPieceComponent[];
  metalValue: number;
  stoneValue: number;
  /** Fields for the parent line / stock row (see PieceComponent's doc). */
  summary: {
    metalTypeId: string | null;
    purity: PurityType | null;
    purityLabel: string | null;
    grossWeight: number | null;
    netWeight: number | null;
    fineWeight: number | null;
    stoneCharge: number;
    caratWeight: number | null;
    stoneWeight: number | null;
    stoneMetalTypeName: string | null;
    stoneTypeNames: string | null;
  };
};

const PURITY_VALUES = new Set<string>(Object.values(PurityType));

function toNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Loads what validation needs once per document; returns a function that
 * resolves one piece's rows. `label` names the piece in error messages.
 */
export async function getPieceResolver(storeId: string, options: { valuation: PieceValuation }) {
  const [metals, gstRates, fineOf] = await Promise.all([
    prisma.storeMetal.findMany({
      where: { storeId },
      select: { id: true, name: true, hasPurity: true, isGemstone: true },
    }),
    prisma.gstRate.findMany({ where: { storeId }, select: { id: true, name: true, ratePercent: true } }),
    getFineWeightResolver(storeId),
  ]);
  const metalById = new Map(metals.map((metal) => [metal.id, metal]));
  const stoneNames = new Set(metals.filter((metal) => metal.isGemstone).map((metal) => metal.name));
  const gstById = new Map(gstRates.map((rate) => [rate.id, rate]));

  return (rows: PieceComponentPayload[], label: string): { error: string } | ResolvedPiece => {
    if (!Array.isArray(rows) || rows.length === 0) return { error: `Add the metals and stones of ${label}.` };
    const components: ResolvedPieceComponent[] = [];

    for (const [index, row] of rows.entries()) {
      const gst = row.gstRateId ? gstById.get(row.gstRateId) : undefined;
      if (row.gstRateId && !gst) return { error: `A GST rate on ${label} is invalid — pick it again.` };
      const gstFields = {
        gstRateId: gst?.id ?? null,
        gstRateName: gst?.name ?? null,
        gstRatePercent: gst ? Number(gst.ratePercent) : null,
      };

      if (row.kind === "STONE") {
        const name = row.stoneMetalTypeName?.trim() || "";
        if (!stoneNames.has(name)) return { error: `Select the stone for every stone row of ${label}.` };
        const caratWeight = toNumber(row.caratWeight);
        const stoneWeight = toNumber(row.stoneWeight);
        const rate = toNumber(row.rate);
        if (caratWeight < 0 || stoneWeight < 0 || rate < 0) return { error: `Stone values on ${label} can't be negative.` };
        const details = parseStoneDetails(row, label);
        if ("error" in details) return details;
        const typed = row.amount != null ? toNumber(row.amount) : null;
        const amount = round2(typed != null && typed >= 0 ? typed : caratWeight * rate);
        components.push({
          kind: "STONE",
          sortOrder: index,
          metalTypeId: null,
          metalName: null,
          purity: null,
          purityLabel: null,
          grossWeight: null,
          netWeight: null,
          fineWeight: null,
          stoneMetalTypeName: name,
          stoneTypeNames: row.stoneTypeNames?.trim() || null,
          caratWeight: caratWeight || null,
          stoneWeight: stoneWeight || null,
          ...details,
          rate: rate || null,
          amount,
          ...gstFields,
        });
        continue;
      }

      const metal = row.metalTypeId ? metalById.get(row.metalTypeId) : undefined;
      if (!metal || metal.isGemstone) return { error: `Select the metal for every metal row of ${label}.` };
      const purityLabel = row.purityLabel?.trim() || null;
      const purity = row.purity && PURITY_VALUES.has(row.purity) ? (row.purity as PurityType) : null;
      if (metal.hasPurity && !purityLabel && !purity) {
        return { error: `Select the purity of the ${metal.name} in ${label}.` };
      }
      const netWeight = toNumber(row.netWeight);
      if (!(netWeight > 0)) return { error: `Enter the net weight of the ${metal.name} in ${label}.` };
      const grossWeight = row.grossWeight ? toNumber(row.grossWeight) : null;
      if (grossWeight !== null && grossWeight > 0 && grossWeight + 0.0005 < netWeight) {
        return { error: `Gross weight can't be less than net weight for the ${metal.name} in ${label}.` };
      }
      const rate = toNumber(row.rate);
      if (rate < 0) return { error: `Rate on ${label} can't be negative.` };
      const fineWeight = fineOf({ metalTypeId: metal.id, purityLabel, purity, netWeight }) ?? netWeight;
      const valued = options.valuation === "fine" ? fineWeight : netWeight;
      components.push({
        kind: "METAL",
        sortOrder: index,
        metalTypeId: metal.id,
        metalName: metal.name,
        purity,
        purityLabel,
        grossWeight: grossWeight && grossWeight > 0 ? grossWeight : null,
        netWeight,
        fineWeight,
        stoneMetalTypeName: null,
        stoneTypeNames: null,
        caratWeight: null,
        stoneWeight: null,
        pieces: null,
        clarity: null,
        certificateNumber: null,
        rate: rate || null,
        amount: round2(valued * rate),
        ...gstFields,
      });
    }

    const metalRows = components.filter((row) => row.kind === "METAL");
    const stoneRows = components.filter((row) => row.kind === "STONE");
    if (!metalRows.length && !stoneRows.length) return { error: `Add the metals and stones of ${label}.` };
    const primary = metalRows[0];
    const sum = (values: (number | null)[]) => round5(values.reduce<number>((acc, v) => acc + (v ?? 0), 0));
    const metalGross = sum(metalRows.map((row) => row.grossWeight ?? row.netWeight));
    const stoneGrams = sum(stoneRows.map((row) => row.stoneWeight));

    return {
      components,
      metalValue: round2(metalRows.reduce((acc, row) => acc + row.amount, 0)),
      stoneValue: round2(stoneRows.reduce((acc, row) => acc + row.amount, 0)),
      summary: {
        metalTypeId: primary?.metalTypeId ?? null,
        purity: primary?.purity ?? null,
        purityLabel: primary?.purityLabel ?? null,
        grossWeight: metalRows.length ? round5(metalGross + stoneGrams) : null,
        netWeight: metalRows.length ? sum(metalRows.map((row) => row.netWeight)) : null,
        // Only the first metal's own pure weight — see PieceComponent's doc.
        fineWeight: primary
          ? sum(metalRows.filter((row) => row.metalTypeId === primary.metalTypeId).map((row) => row.fineWeight))
          : null,
        stoneCharge: round2(stoneRows.reduce((acc, row) => acc + row.amount, 0)),
        caratWeight: stoneRows.length ? sum(stoneRows.map((row) => row.caratWeight)) : null,
        stoneWeight: stoneRows.length ? stoneGrams : null,
        stoneMetalTypeName: stoneRows[0]?.stoneMetalTypeName ?? null,
        stoneTypeNames: stoneRows[0]?.stoneTypeNames ?? null,
      },
    };
  };
}

const MAX_TEXT = 120;

/**
 * A stone's number of stones (whole number ≥ 1), clarity and certificate
 * number — all optional. Shared by multi-part stone rows and single-stone
 * sale lines (`label` names the piece in errors).
 */
export function parseStoneDetails(
  row: { pieces?: unknown; clarity?: unknown; certificateNumber?: unknown },
  label: string,
): { error: string } | { pieces: number | null; clarity: string | null; certificateNumber: string | null } {
  let pieces: number | null = null;
  if (row.pieces != null && row.pieces !== "" && row.pieces !== 0) {
    const n = Number(row.pieces);
    if (!Number.isInteger(n) || n < 1) return { error: `Stone pcs on ${label} must be a whole number of 1 or more.` };
    if (n > 1_000_000) return { error: `Stone pcs on ${label} is too large.` };
    pieces = n;
  }
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const clarity = text(row.clarity);
  const certificateNumber = text(row.certificateNumber);
  if (clarity.length > MAX_TEXT || certificateNumber.length > MAX_TEXT) {
    return { error: `Stone clarity / certificate on ${label} is too long.` };
  }
  return { pieces, clarity: clarity || null, certificateNumber: certificateNumber || null };
}

/** Nested-create payload for a parent's `components: { create: ... }`. */
export function pieceComponentCreates(components: ResolvedPieceComponent[]) {
  return components.map((row) => ({
    kind: row.kind,
    sortOrder: row.sortOrder,
    metalTypeId: row.metalTypeId,
    purity: row.purity,
    purityLabel: row.purityLabel,
    grossWeight: row.grossWeight,
    netWeight: row.netWeight,
    fineWeight: row.fineWeight,
    stoneMetalTypeName: row.stoneMetalTypeName,
    stoneTypeNames: row.stoneTypeNames,
    caratWeight: row.caratWeight,
    stoneWeight: row.stoneWeight,
    pieces: row.pieces,
    clarity: row.clarity,
    certificateNumber: row.certificateNumber,
    rate: row.rate,
    amount: row.amount,
    gstRateId: row.gstRateId,
    gstRateName: row.gstRateName,
    gstRatePercent: row.gstRatePercent,
  }));
}

/** Stored rows (any parent) → the client shape (lib/piece-components StoredPieceComponent). */
export function serializeStoredComponents(
  rows: {
    id?: string;
    kind: PieceComponentKind;
    metalTypeId: string | null;
    purityLabel: string | null;
    purity: PurityType | null;
    grossWeight: Prisma.Decimal | null;
    netWeight: Prisma.Decimal | null;
    fineWeight: Prisma.Decimal | null;
    stoneMetalTypeName: string | null;
    stoneTypeNames: string | null;
    caratWeight: Prisma.Decimal | null;
    stoneWeight: Prisma.Decimal | null;
    pieces?: number | null;
    clarity?: string | null;
    certificateNumber?: string | null;
    rate: Prisma.Decimal | null;
    amount: Prisma.Decimal;
    gstRateId: string | null;
    gstRatePercent?: Prisma.Decimal | null;
    sortOrder: number;
    metalType?: { name: string } | null;
  }[],
) {
  const n = (value: Prisma.Decimal | null) => (value == null ? null : Number(value));
  return [...rows]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      metalTypeId: row.metalTypeId,
      purityLabel: row.purityLabel,
      purity: row.purity,
      grossWeight: n(row.grossWeight),
      netWeight: n(row.netWeight),
      fineWeight: n(row.fineWeight),
      stoneMetalTypeName: row.stoneMetalTypeName,
      stoneTypeNames: row.stoneTypeNames,
      caratWeight: n(row.caratWeight),
      stoneWeight: n(row.stoneWeight),
      pieces: row.pieces ?? null,
      clarity: row.clarity ?? null,
      certificateNumber: row.certificateNumber ?? null,
      rate: n(row.rate),
      amount: Number(row.amount),
      gstRateId: row.gstRateId,
      metalName: row.metalType?.name ?? null,
      gstRatePercent: row.gstRatePercent != null ? Number(row.gstRatePercent) : null,
    }));
}

type LineStoneFields = {
  itemName?: string | null;
  stoneMetalTypeName?: string | null;
  stonePieces?: number | null;
  stoneClarity?: string | null;
  stoneCertificateNumber?: string | null;
};

/**
 * A single-stone sale line's pcs / clarity / certificate (InvoiceItem,
 * KachaInvoiceItem, QuotationItem .stonePieces/.stoneClarity/
 * .stoneCertificateNumber), validated like a multi-part stone row. Cleared
 * on a line with no stone, and on a multi-part line (its rows carry them).
 */
export function resolveLineStoneDetails<T extends LineStoneFields>(item: T, multiPart: boolean): { error: string } | T {
  if (multiPart || !item.stoneMetalTypeName?.trim()) {
    return { ...item, stonePieces: null, stoneClarity: null, stoneCertificateNumber: null };
  }
  const details = parseStoneDetails(
    { pieces: item.stonePieces, clarity: item.stoneClarity, certificateNumber: item.stoneCertificateNumber },
    `"${item.itemName || "a line item"}"`,
  );
  if ("error" in details) return details;
  return {
    ...item,
    stonePieces: details.pieces,
    stoneClarity: details.clarity,
    stoneCertificateNumber: details.certificateNumber,
  };
}
