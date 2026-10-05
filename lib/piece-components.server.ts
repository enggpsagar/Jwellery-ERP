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
      rate: n(row.rate),
      amount: Number(row.amount),
      gstRateId: row.gstRateId,
      metalName: row.metalType?.name ?? null,
      gstRatePercent: row.gstRatePercent != null ? Number(row.gstRatePercent) : null,
    }));
}
