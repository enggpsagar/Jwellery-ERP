import { PrismaClient, PurityType } from "@prisma/client";

const prisma = new PrismaClient();

// Mirrors product-form.tsx's PURITY_OPTIONS_BY_METAL — the app's only
// existing approximation of "purity is per-metal" before this migration.
// Used here purely to seed each store's real StoreMetalPurity rows once,
// from data that already exists (this map + each store's own configured
// PurityFineness/CaratConversionRate/MetalSellingRate rows), never invented.
const PURITY_OPTIONS_BY_FAMILY: Record<string, PurityType[]> = {
  GOLD: [PurityType.GOLD_24K, PurityType.GOLD_22K, PurityType.GOLD_20K, PurityType.GOLD_18K],
  SILVER: [PurityType.SILVER_999, PurityType.SILVER_925],
  PLATINUM: [PurityType.PLATINUM_950, PurityType.PLATINUM_900],
};

const DEFAULT_FINENESS: Record<PurityType, number> = {
  GOLD_24K: 100.0,
  GOLD_22K: 91.6,
  GOLD_20K: 83.3,
  GOLD_18K: 75.0,
  SILVER_999: 99.9,
  SILVER_925: 92.5,
  PLATINUM_950: 95.0,
  PLATINUM_900: 90.0,
  DIAMOND: 100.0,
  OTHER: 100.0,
};

const HALLMARKABLE = new Set<PurityType>([
  PurityType.GOLD_18K,
  PurityType.GOLD_20K,
  PurityType.GOLD_22K,
  PurityType.GOLD_24K,
  PurityType.SILVER_925,
  PurityType.SILVER_999,
]);

function skuCode(purity: PurityType): string {
  const match = purity.match(/_(\d+)/);
  return match ? match[1] : purity;
}

function label(purity: PurityType): string {
  const match = purity.match(/_(\d+)K$/);
  if (match) return `${match[1]}K`;
  const numMatch = purity.match(/_(\d+)$/);
  return numMatch ? numMatch[1] : purity;
}

function classifyFamily(name: string): keyof typeof PURITY_OPTIONS_BY_FAMILY | null {
  const lower = name.toLowerCase();
  if (lower.includes("platinum")) return "PLATINUM";
  if (lower.includes("gold")) return "GOLD";
  if (lower.includes("silver")) return "SILVER";
  return null;
}

async function main() {
  const metals = await prisma.storeMetal.findMany({
    where: { hasPurity: true, isGemstone: false },
  });

  console.log(`Found ${metals.length} hasPurity=true, isGemstone=false StoreMetal rows.`);

  let created = 0;
  let skippedExisting = 0;
  let skippedUnclassified = 0;

  for (const metal of metals) {
    const family = classifyFamily(metal.name);
    if (!family) {
      console.log(`  SKIP "${metal.name}" (${metal.id}, store ${metal.storeId}) — name doesn't match Gold/Silver/Platinum.`);
      skippedUnclassified++;
      continue;
    }

    const purities = PURITY_OPTIONS_BY_FAMILY[family];

    const [finenessRows, caratRows, sellingRows, existingPurities] = await Promise.all([
      prisma.purityFineness.findMany({ where: { storeId: metal.storeId, purity: { in: purities } } }),
      prisma.caratConversionRate.findMany({ where: { storeId: metal.storeId, purity: { in: purities } } }),
      prisma.metalSellingRate.findMany({ where: { storeId: metal.storeId, purity: { in: purities } } }),
      prisma.storeMetalPurity.findMany({ where: { storeMetalId: metal.id }, select: { label: true } }),
    ]);

    const existingLabels = new Set(existingPurities.map((row) => row.label));

    for (let i = 0; i < purities.length; i++) {
      const purity = purities[i];
      const purityLabel = label(purity);

      if (existingLabels.has(purityLabel)) {
        skippedExisting++;
        continue;
      }

      const finenessRow = finenessRows.find((row) => row.purity === purity);
      const sellingRow = sellingRows.find((row) => row.purity === purity);

      await prisma.storeMetalPurity.create({
        data: {
          storeId: metal.storeId,
          storeMetalId: metal.id,
          label: purityLabel,
          skuCode: skuCode(purity),
          finenessPercent: finenessRow ? Number(finenessRow.finenessPercent) : DEFAULT_FINENESS[purity],
          sellingPrice: sellingRow ? Number(sellingRow.sellingPrice) : null,
          isHallmarkable: HALLMARKABLE.has(purity),
          sortOrder: i,
        },
      });
      created++;
    }
  }

  console.log(`\nCreated ${created} StoreMetalPurity rows.`);
  console.log(`Skipped ${skippedExisting} already-existing labels, ${skippedUnclassified} unclassifiable metals.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
