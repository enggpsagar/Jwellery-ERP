import type { Prisma } from "@prisma/client"

// Pre-filled for every new store at creation (seedStarterMasters, both the
// self-registration and the Super Admin "Add Store" paths). Styles and
// clarities also reached existing stores once via migration
// 20261007130000_seed_styles_clarities (keep its lists in step); the metals,
// purities, stone types and GST rates are new-store only by decision —
// existing stores keep the taxonomy they already configured.

export const STARTER_STYLES = ["Ladies", "Gents", "Kids", "Unisex"]

// Common diamond colour/clarity grades as tagged in the trade.
export const STARTER_CLARITIES = [
  "EF/VVS",
  "EF/VVS-VS",
  "FG/VVS-VS",
  "GH/VS",
  "GH/VS-SI",
  "HI/SI",
  "IJ/SI",
]

type StarterPurity = {
  label: string
  skuCode: string
  finenessPercent: number
  isHallmarkable: boolean
}

type StarterMetal = {
  name: string
  hasPurity: boolean
  isGemstone: boolean
  purities?: StarterPurity[]
  /** Stone Types (StoreMetalOrigin) — gemstones only. */
  stoneTypes?: string[]
}

// Fineness: standard trade values (22K = 91.6, 925 = 92.5 ...). Hallmarkable
// follows isHallmarkablePurity() in lib/purity.ts: gold and silver, not
// platinum.
export const STARTER_METALS: StarterMetal[] = [
  {
    name: "Gold",
    hasPurity: true,
    isGemstone: false,
    purities: [
      { label: "24K", skuCode: "24", finenessPercent: 100, isHallmarkable: true },
      { label: "22K", skuCode: "22", finenessPercent: 91.6, isHallmarkable: true },
      { label: "20K", skuCode: "20", finenessPercent: 83.3, isHallmarkable: true },
      { label: "18K", skuCode: "18", finenessPercent: 75, isHallmarkable: true },
      { label: "14K", skuCode: "14", finenessPercent: 58.5, isHallmarkable: true },
    ],
  },
  {
    name: "Silver",
    hasPurity: true,
    isGemstone: false,
    purities: [
      { label: "999", skuCode: "999", finenessPercent: 99.9, isHallmarkable: true },
      { label: "925", skuCode: "925", finenessPercent: 92.5, isHallmarkable: true },
    ],
  },
  {
    name: "Platinum",
    hasPurity: true,
    isGemstone: false,
    purities: [
      { label: "950", skuCode: "950", finenessPercent: 95, isHallmarkable: false },
      { label: "900", skuCode: "900", finenessPercent: 90, isHallmarkable: false },
    ],
  },
  { name: "Diamond", hasPurity: false, isGemstone: true, stoneTypes: ["Natural", "Lab-Grown"] },
  { name: "Ruby", hasPurity: false, isGemstone: true, stoneTypes: ["Natural"] },
  { name: "Emerald", hasPurity: false, isGemstone: true, stoneTypes: ["Natural"] },
  { name: "Sapphire", hasPurity: false, isGemstone: true, stoneTypes: ["Natural"] },
  { name: "Other", hasPurity: false, isGemstone: false },
]

export const STARTER_CATEGORIES: { name: string; types: string[] }[] = [
  {
    name: "Ornament",
    types: ["Ring", "Chain", "Necklace", "Bangle", "Earring", "Bracelet", "Pendant"],
  },
  { name: "Coin", types: ["Gold Coin", "Silver Coin"] },
  { name: "Bar", types: ["Bar"] },
  { name: "Loose Stone", types: ["Loose Stone"] },
  { name: "Diamond", types: ["Loose Diamond", "Diamond Jewellery"] },
]

// Starting rates, not tax advice — same "verify locally" convention as
// BusinessSettings.hallmarkChargePerPiece. 3% (gold/silver/platinum and
// jewellery, HSN 71xx) is settled. 0.25% for unworked diamonds/stones is
// settled, but published sources disagree on cut & polished diamonds
// (0.25% / 1.5% / 3%), so the store's CA should confirm before relying on
// it. 5% is job work by an artisan (SAC 9988), not the making charge on a
// jewellery sale — that is part of the jewellery's own 3% supply.
export const STARTER_GST_RATES: { name: string; ratePercent: number; isDefault: boolean }[] = [
  { name: "3% - Gold, Silver, Platinum & Jewellery", ratePercent: 3, isDefault: true },
  { name: "0.25% - Rough / Loose Diamonds & Stones", ratePercent: 0.25, isDefault: false },
  { name: "5% - Job Work (Artisan Labour)", ratePercent: 5, isDefault: false },
  { name: "0% - Nil / Exempt", ratePercent: 0, isDefault: false },
]

/**
 * Everything a brand-new store needs to start entering stock on day one:
 * metals with their purities, gemstones with their stone types, categories,
 * styles, stone clarities and GST rates. Call inside the store-creation
 * transaction, right after the Store row is created.
 */
export async function seedStarterMasters(tx: Prisma.TransactionClient, storeId: string) {
  const metals = await tx.storeMetal.createManyAndReturn({
    data: STARTER_METALS.map((metal) => ({
      storeId,
      name: metal.name,
      hasPurity: metal.hasPurity,
      isGemstone: metal.isGemstone,
      primaryUnit: metal.isGemstone ? "CARAT" : "GRAM",
    })),
    select: { id: true, name: true },
  })
  const metalIdByName = new Map(metals.map((metal) => [metal.name, metal.id]))

  await tx.storeMetalPurity.createMany({
    data: STARTER_METALS.flatMap((metal) =>
      (metal.purities ?? []).map((purity, index) => ({
        storeId,
        storeMetalId: metalIdByName.get(metal.name)!,
        label: purity.label,
        skuCode: purity.skuCode,
        finenessPercent: purity.finenessPercent,
        isHallmarkable: purity.isHallmarkable,
        sortOrder: index,
      })),
    ),
  })

  await tx.storeMetalOrigin.createMany({
    data: STARTER_METALS.flatMap((metal) =>
      (metal.stoneTypes ?? []).map((name) => ({
        storeId,
        storeMetalId: metalIdByName.get(metal.name)!,
        name,
      })),
    ),
  })

  for (const category of STARTER_CATEGORIES) {
    const createdCategory = await tx.storeCategory.create({
      data: { storeId, name: category.name },
    })
    await tx.storeCategoryType.createMany({
      data: category.types.map((name) => ({ storeId, categoryId: createdCategory.id, name })),
    })
  }

  await tx.storeStyle.createMany({
    data: STARTER_STYLES.map((name) => ({ storeId, name })),
    skipDuplicates: true,
  })
  await tx.storeStoneClarity.createMany({
    data: STARTER_CLARITIES.map((name) => ({ storeId, name })),
    skipDuplicates: true,
  })

  await tx.gstRate.createMany({
    data: STARTER_GST_RATES.map((rate) => ({ storeId, ...rate })),
    skipDuplicates: true,
  })
}
