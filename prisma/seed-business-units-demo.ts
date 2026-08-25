// Demo/exploration data for the Business Model (Money/Gold/Silver/Diamond)
// feature — creates 4 separate stores, each configured with a different
// combination of business units, with a couple of customers and ledger
// entries denominated in the right unit(s) so switching between them (as
// Super Admin, via the store switcher) shows the Ledger/Customer Ledger
// cards actually differing per store. Safe to re-run: everything is
// upserted by a stable natural key (store code, customer phone).
import {
  PrismaClient,
  BusinessUnit,
  LedgerEntryType,
  LedgerSourceType,
} from "@prisma/client";

const prisma = new PrismaClient();

type DemoStore = {
  code: string;
  name: string;
  businessUnits: BusinessUnit[];
  metals: string[];
  customers: {
    name: string;
    phone: string;
    openingBalance?: number;
    entries: {
      type: LedgerEntryType;
      metal?: string;
      amount?: number;
      weight?: number;
      description: string;
    }[];
  }[];
};

const STORES: DemoStore[] = [
  {
    code: "DEMO-GOLD",
    name: "Demo - Gold Business",
    businessUnits: [BusinessUnit.MONEY, BusinessUnit.GOLD],
    metals: ["Gold"],
    customers: [
      {
        name: "Demo Gold Customer 1",
        phone: "7000000001",
        openingBalance: 2000,
        entries: [
          { type: LedgerEntryType.DEBIT, metal: "Gold", weight: 25, description: "Gold ornament sale — 25g owed" },
          { type: LedgerEntryType.CREDIT, metal: "Gold", weight: 10, description: "Gold received against dues" },
          { type: LedgerEntryType.DEBIT, amount: 5000, description: "Making charge balance due" },
        ],
      },
      {
        name: "Demo Gold Customer 2",
        phone: "7000000002",
        entries: [
          { type: LedgerEntryType.DEBIT, metal: "Gold", weight: 12.5, description: "Gold chain sale — 12.5g owed" },
        ],
      },
    ],
  },
  {
    code: "DEMO-SILVER",
    name: "Demo - Silver Business",
    businessUnits: [BusinessUnit.MONEY, BusinessUnit.SILVER],
    metals: ["Silver"],
    customers: [
      {
        name: "Demo Silver Customer 1",
        phone: "7000000003",
        openingBalance: 500,
        entries: [
          { type: LedgerEntryType.DEBIT, metal: "Silver", weight: 340, description: "Silver utensils sale — 340g owed" },
          { type: LedgerEntryType.CREDIT, metal: "Silver", weight: 150, description: "Silver received against dues" },
        ],
      },
      {
        name: "Demo Silver Customer 2",
        phone: "7000000004",
        entries: [
          { type: LedgerEntryType.DEBIT, metal: "Silver", weight: 80, description: "Silver coin sale — 80g owed" },
        ],
      },
    ],
  },
  {
    code: "DEMO-DIAMOND",
    name: "Demo - Diamond Business",
    businessUnits: [BusinessUnit.MONEY, BusinessUnit.DIAMOND],
    metals: ["Diamond"],
    customers: [
      {
        name: "Demo Diamond Customer 1",
        phone: "7000000005",
        openingBalance: 10000,
        entries: [
          { type: LedgerEntryType.DEBIT, metal: "Diamond", amount: 185000, description: "Diamond ring sale — value due" },
          { type: LedgerEntryType.CREDIT, metal: "Diamond", amount: 60000, description: "Partial payment received" },
        ],
      },
    ],
  },
  {
    code: "DEMO-MIXED",
    name: "Demo - Money + Gold + Silver + Diamond",
    businessUnits: [
      BusinessUnit.MONEY,
      BusinessUnit.GOLD,
      BusinessUnit.SILVER,
      BusinessUnit.DIAMOND,
    ],
    metals: ["Gold", "Silver", "Diamond"],
    customers: [
      {
        name: "Demo Mixed Customer 1",
        phone: "7000000006",
        openingBalance: 3000,
        entries: [
          { type: LedgerEntryType.DEBIT, description: "Cash sale balance due", amount: 15000 },
          { type: LedgerEntryType.DEBIT, metal: "Gold", weight: 18, description: "Gold item sale — 18g owed" },
          { type: LedgerEntryType.CREDIT, metal: "Gold", weight: 5, description: "Gold received against dues" },
          { type: LedgerEntryType.DEBIT, metal: "Silver", weight: 200, description: "Silver item sale — 200g owed" },
          { type: LedgerEntryType.DEBIT, metal: "Diamond", amount: 95000, description: "Diamond pendant sale — value due" },
        ],
      },
    ],
  },
];

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

async function seedStore(demo: DemoStore) {
  const store = await prisma.store.upsert({
    where: { code: demo.code },
    update: { name: demo.name, isActive: true },
    create: { name: demo.name, code: demo.code },
  });

  await prisma.businessSettings.upsert({
    where: { storeId: store.id },
    update: { businessUnits: demo.businessUnits },
    create: {
      storeId: store.id,
      businessName: demo.name,
      businessUnits: demo.businessUnits,
    },
  });

  const metalIdByName = new Map<string, string>();
  for (const metalName of demo.metals) {
    const existing = await prisma.storeMetal.findFirst({
      where: { storeId: store.id, name: metalName },
    });

    const metal =
      existing ??
      (await prisma.storeMetal.create({
        data: { storeId: store.id, name: metalName, hasPurity: metalName === "Gold" },
      }));

    metalIdByName.set(metalName, metal.id);
  }

  for (const c of demo.customers) {
    const customer = await prisma.customer.upsert({
      where: { storeId_phone: { storeId: store.id, phone: c.phone } },
      update: { name: c.name, openingBalance: c.openingBalance ?? 0 },
      create: {
        storeId: store.id,
        name: c.name,
        phone: c.phone,
        openingBalance: c.openingBalance ?? 0,
      },
    });

    // Re-seedable: clear this customer's prior demo ledger entries before recreating.
    await prisma.ledgerEntry.deleteMany({
      where: { storeId: store.id, customerId: customer.id, sourceType: LedgerSourceType.MANUAL },
    });

    let dayOffset = c.entries.length;
    for (const entry of c.entries) {
      const metalTypeId = entry.metal ? metalIdByName.get(entry.metal) : undefined;

      await prisma.ledgerEntry.create({
        data: {
          storeId: store.id,
          customerId: customer.id,
          type: entry.type,
          sourceType: LedgerSourceType.MANUAL,
          metalTypeId,
          metalWeight: entry.weight ?? undefined,
          metalWeightFine: entry.weight ?? undefined,
          amount: entry.amount ?? 0,
          description: entry.description,
          entryDate: daysAgo(dayOffset--),
        },
      });
    }
  }

  console.log(`Seeded ${demo.code} — units: ${demo.businessUnits.join(", ")}, customers: ${demo.customers.length}`);
}

async function main() {
  for (const demo of STORES) {
    await seedStore(demo);
  }
}

main()
  .then(async () => {
    console.log("Business-units demo stores ready. Switch stores as Super Admin to explore each one's Ledger/Customer Ledger.");
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("Business-units demo seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
