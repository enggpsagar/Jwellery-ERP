// The metal / stone rows a stock piece sells with — shared by every sale
// form's stock list (Invoice, Kacha, Quotation) and by their save actions,
// which lock the rows' physical facts server-side.
//
// A piece's rows are its own PieceComponent rows when it has them (bought
// multi-part on a Purchase, minted from a multi-part sale line). A piece
// added through Add Stock / the stock import has none — those only copy the
// Product's FIRST metal and FIRST stone onto the stock row — so a Product
// with more than one metal or more than one stone (ProductMetalComponent /
// ProductStoneComponent) supplies the rows instead. Before this, picking such
// a piece opened a single-metal line with only its first stone, and the save
// action downgraded any multi-part line on it to a single line.
import "server-only";

import type { PieceComponentKind, Prisma, PurityType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { classifyPurityFamily } from "@/lib/business-units";
import { GRAMS_PER_CARAT, matchLegacyPurityType } from "@/lib/purity";
import { round2, round5, type StoredPieceComponent } from "@/lib/piece-components";
import { serializeStoredComponents } from "@/lib/piece-components.server";
import { stockOptionProductDetailsSelect, type ProductDetails } from "@/lib/inventory/stock-option-details";
import type { LinkedStoneDetails } from "@/lib/inventory/stock-pick-rates";

type Decimalish = Prisma.Decimal | null;

type StockWithRows = {
  grossWeight: Decimalish;
  netWeight: Decimalish;
  stoneMetalTypeName: string | null;
  components: {
    id?: string;
    kind: PieceComponentKind;
    metalTypeId: string | null;
    purityLabel: string | null;
    purity: PurityType | null;
    grossWeight: Decimalish;
    netWeight: Decimalish;
    fineWeight: Decimalish;
    stoneMetalTypeName: string | null;
    stoneTypeNames: string | null;
    caratWeight: Decimalish;
    stoneWeight: Decimalish;
    pieces?: number | null;
    clarity?: string | null;
    certificateNumber?: string | null;
    rate: Decimalish;
    amount: Prisma.Decimal;
    gstRateId: string | null;
    sortOrder: number;
  }[];
  product: Pick<ProductDetails, "metalComponents" | "stoneComponents">;
};


const num = (value: Decimalish | undefined) => (value == null ? null : Number(value));

/** Whether a Product is a piece a single line can't express: more than one
 * metal or more than one stone (same rule as the purchase form). */
function isMultiComponentProduct(product: StockWithRows["product"]) {
  return product.metalComponents.length > 1 || product.stoneComponents.length > 1;
}

/** "The nth row named X" matcher — the nth stone of a kind on the stock is
 * the Product's nth stone of that kind. */
function nthMatcher<T>(rows: T[], keyOf: (row: T) => string | null) {
  const seen = new Map<string, number>();
  return (key: string | null) => {
    if (!key) return undefined;
    const nth = seen.get(key) ?? 0;
    seen.set(key, nth + 1);
    return rows.filter((row) => keyOf(row) === key)[nth];
  };
}

/**
 * The rows a picked stock piece opens with (empty = an ordinary single
 * line), each carrying its pieces / clarity / certificate (its own, else
 * the Product's matching row's), the Product row's stone rate and its purity's selling price as picker hints.
 */
export function stockPieceComponents(stock: StockWithRows): StoredPieceComponent[] {
  const product = stock.product;
  const productMetal = nthMatcher(product.metalComponents, (row) => row.metalTypeId);
  const productStone = nthMatcher(product.stoneComponents, (row) => row.stoneMetalTypeName);

  let rows: StoredPieceComponent[];
  if (stock.components.length) {
    rows = serializeStoredComponents(stock.components);
  } else if (isMultiComponentProduct(product)) {
    const singleMetal = product.metalComponents.length === 1;
    const metals: StoredPieceComponent[] = product.metalComponents.map((row) => {
      // A one-metal product with several stones: the stock row's own net
      // weight is this piece's real metal weight (the Product's is a design
      // default). Several metals: the stock row only knows their sum.
      const net = singleMetal ? num(stock.netWeight) ?? num(row.netWeight) : num(row.netWeight);
      const gross = num(row.grossWeight);
      const purityLabel = row.storeMetalPurity?.label ?? null;
      return {
        kind: "METAL",
        metalTypeId: row.metalTypeId,
        purityLabel,
        purity: matchLegacyPurityType(classifyPurityFamily(row.metalType), purityLabel),
        grossWeight: gross != null && net != null ? Math.max(gross, net) : gross ?? net,
        netWeight: net ?? gross,
        fineWeight: null,
        stoneMetalTypeName: null,
        stoneTypeNames: null,
        caratWeight: null,
        stoneWeight: null,
        rate: null,
        amount: 0,
        gstRateId: row.gstRateId,
      };
    });
    const stones: StoredPieceComponent[] = product.stoneComponents.map((row) => {
      const caratWeight = num(row.caratWeight);
      const rate = num(row.stoneRate);
      return {
        kind: "STONE",
        metalTypeId: null,
        purityLabel: null,
        purity: null,
        grossWeight: null,
        netWeight: null,
        fineWeight: null,
        stoneMetalTypeName: row.stoneMetalTypeName,
        stoneTypeNames: row.stoneTypeNames,
        caratWeight,
        // Add Product doesn't always record a stone's grams — carats × 0.2.
        stoneWeight: num(row.stoneWeight) ?? (caratWeight != null ? round5(caratWeight * GRAMS_PER_CARAT) : null),
        rate,
        amount: rate != null && caratWeight != null ? round2(rate * caratWeight) : num(row.stoneCharge) ?? 0,
        gstRateId: row.gstRateId,
      };
    });
    rows = [...metals, ...stones];
  } else {
    return [];
  }

  return rows.map((row) => {
    if (row.kind === "METAL") {
      const match = productMetal(row.metalTypeId);
      // The Product row's purity only prices this row when it is the same purity.
      const samePurity = match && (!row.purityLabel || match.storeMetalPurity?.label === row.purityLabel);
      return {
        ...row,
        puritySellingPrice: samePurity ? num(match.storeMetalPurity?.sellingPrice) : null,
        purityFineness: samePurity ? num(match.storeMetalPurity?.finenessPercent) : null,
      };
    }
    const match = productStone(row.stoneMetalTypeName);
    return {
      ...row,
      stoneTypeNames: row.stoneTypeNames || match?.stoneTypeNames || null,
      // The piece's own saved values win; else its Product's stone row.
      pieces: row.pieces ?? match?.pieces ?? null,
      clarity: row.clarity || match?.clarity || null,
      certificateNumber: row.certificateNumber || match?.certificateNumber || null,
      catalogRate: num(match?.stoneRate),
    };
  });
}

/** A single-stone piece's stone details, from the Product's matching stone
 * row (by name, else its first). */
export function linkedStoneDetails(stock: Pick<StockWithRows, "stoneMetalTypeName" | "product">): LinkedStoneDetails | null {
  const stones = stock.product.stoneComponents;
  const match = stones.find((row) => row.stoneMetalTypeName === stock.stoneMetalTypeName) ?? stones[0];
  if (!match) return null;
  return {
    pieces: match.pieces ?? null,
    clarity: match.clarity ?? null,
    certificateNumber: match.certificateNumber ?? null,
    catalogRate: num(match.stoneRate),
  };
}

/** Everything a sale form's stock option carries about the piece's rows. */
export function stockPieceOption(stock: StockWithRows) {
  return {
    components: stockPieceComponents(stock),
    linkedStone: linkedStoneDetails(stock),
  };
}

/**
 * The locked rows of the given stock pieces, for a save action: a
 * multi-part line on a linked piece is rebuilt from these (physical facts),
 * taking only rates / GST / a stone's typed value from the client.
 * Store-scoped; a piece with no rows is absent from the map.
 */
export async function lockedStockPieceRows(storeId: string, stockIds: string[]) {
  const out = new Map<string, StoredPieceComponent[]>();
  if (!stockIds.length) return out;
  const stocks = await prisma.inventoryStock.findMany({
    where: { id: { in: [...new Set(stockIds)] }, storeId },
    select: {
      id: true,
      grossWeight: true,
      netWeight: true,
      stoneMetalTypeName: true,
      components: true,
      product: {
        select: {
          metalComponents: stockOptionProductDetailsSelect.metalComponents,
          stoneComponents: stockOptionProductDetailsSelect.stoneComponents,
        },
      },
    },
  });
  for (const stock of stocks) {
    const rows = stockPieceComponents(stock);
    if (rows.length) out.set(stock.id, rows);
  }
  return out;
}

type NewStockProduct = Pick<ProductDetails, "metalComponents" | "stoneComponents">;

export type NewStockPieceRows = {
  /** PieceComponent rows for the new stock row (no parent id set). */
  components: Prisma.PieceComponentCreateManyInventoryStockInput[];
  /** The stock row's summary fields (see PieceComponent's doc): fineWeight =
   * only the first metal's own pure weight; stoneCharge = all stones. */
  fineWeight: number | null;
  stoneCharge: number;
  /** Per metal (for the stock-added ledger entries), in row order. */
  metals: { metalTypeId: string; netWeight: number; fineWeight: number | null }[];
};

/**
 * The metal / stone rows Add Stock (and the stock import) write for a piece
 * of a Product with more than one metal or more than one stone — null for an
 * ordinary single-metal / single-stone Product, which keeps the stock row's
 * own fields as before.
 *
 * Add Stock captures one net weight and one carat weight for the piece, not
 * one per row, so the rows take the Product's own per-metal / per-stone
 * weights, scaled so they add up to what was entered: a one-metal Product
 * with several stones puts the whole net weight on that metal; several
 * metals share it in the Product's proportions (as entered on Add Product).
 * Stones likewise share the entered carats. Blank / 0 entered = the
 * Product's weights as they are. Pieces / clarity / certificate and the
 * stone rate come from the Product's stone rows.
 */
export function newStockPieceRows(
  product: NewStockProduct,
  entered: { netWeight: number | null; caratWeight: number | null },
  options: {
    fineOf: (line: { metalTypeId: string; purityLabel: string | null; purity: PurityType | null; netWeight: number }) => number | null;
    gstById: Map<string, { name: string; ratePercent: Prisma.Decimal | number }>;
  },
): NewStockPieceRows | null {
  if (!isMultiComponentProduct({ metalComponents: product.metalComponents, stoneComponents: product.stoneComponents })) {
    return null;
  }
  const scale = (values: (number | null)[], total: number | null) => {
    const sum = values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
    if (total == null || !(total > 0) || !(sum > 0)) return 1;
    return total / sum;
  };
  const gstFields = (gstRateId: string | null) => {
    const gst = gstRateId ? options.gstById.get(gstRateId) : undefined;
    return {
      gstRateId: gst ? gstRateId : null,
      gstRateName: gst?.name ?? null,
      gstRatePercent: gst ? Number(gst.ratePercent) : null,
    };
  };

  const metalNets = product.metalComponents.map((row) => num(row.netWeight) ?? num(row.grossWeight));
  const metalFactor = scale(metalNets, entered.netWeight);
  const components: NewStockPieceRows["components"] = [];
  const metals: NewStockPieceRows["metals"] = [];
  product.metalComponents.forEach((row, index) => {
    const productNet = metalNets[index];
    const net = productNet != null ? round5(productNet * metalFactor) : null;
    const productGross = num(row.grossWeight);
    const gross = productGross != null ? round5(productGross * metalFactor) : null;
    const purityLabel = row.storeMetalPurity?.label ?? null;
    const purity = matchLegacyPurityType(classifyPurityFamily(row.metalType), purityLabel) as PurityType | null;
    const fineWeight = net != null && net > 0 ? options.fineOf({ metalTypeId: row.metalTypeId, purityLabel, purity, netWeight: net }) : null;
    components.push({
      kind: "METAL",
      sortOrder: components.length,
      metalTypeId: row.metalTypeId,
      purity,
      purityLabel,
      grossWeight: gross != null && net != null ? Math.max(gross, net) : gross ?? net,
      netWeight: net,
      fineWeight,
      amount: 0,
      ...gstFields(row.gstRateId),
    });
    if (net != null && net > 0) metals.push({ metalTypeId: row.metalTypeId, netWeight: net, fineWeight });
  });

  const stoneCarats = product.stoneComponents.map((row) => num(row.caratWeight));
  const stoneFactor = scale(stoneCarats, entered.caratWeight);
  let stoneCharge = 0;
  product.stoneComponents.forEach((row, index) => {
    const productCarats = stoneCarats[index];
    const caratWeight = productCarats != null ? round5(productCarats * stoneFactor) : null;
    const productGrams = num(row.stoneWeight);
    const stoneWeight =
      productGrams != null
        ? round5(productGrams * stoneFactor)
        : caratWeight != null
          ? round5(caratWeight * GRAMS_PER_CARAT)
          : null;
    const rate = num(row.stoneRate);
    const amount = rate != null && caratWeight != null ? round2(rate * caratWeight) : num(row.stoneCharge) ?? 0;
    stoneCharge += amount;
    components.push({
      kind: "STONE",
      sortOrder: components.length,
      stoneMetalTypeName: row.stoneMetalTypeName,
      stoneTypeNames: row.stoneTypeNames,
      caratWeight,
      stoneWeight,
      pieces: row.pieces ?? null,
      clarity: row.clarity ?? null,
      certificateNumber: row.certificateNumber ?? null,
      rate,
      amount,
      ...gstFields(row.gstRateId),
    });
  });

  const firstMetalId = product.metalComponents[0]?.metalTypeId;
  const firstFine = metals
    .filter((row) => row.metalTypeId === firstMetalId)
    .reduce<number | null>((acc, row) => (row.fineWeight == null ? acc : (acc ?? 0) + row.fineWeight), null);
  return {
    components,
    fineWeight: firstFine != null ? round5(firstFine) : null,
    stoneCharge: round2(stoneCharge),
    metals,
  };
}
