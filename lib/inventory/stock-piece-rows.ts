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
 * line), each carrying the Product's matching row's pieces / clarity /
 * certificate / stone rate and its purity's selling price as picker hints.
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
      pieces: match?.pieces ?? null,
      clarity: match?.clarity ?? null,
      certificateNumber: match?.certificateNumber ?? null,
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
