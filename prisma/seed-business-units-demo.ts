// Demo/exploration data for the Business Model (Money/Gold/Silver/Diamond)
// feature — creates 4 separate stores, each configured with a different
// combination of business units, and populates each with customers, ledger
// entries, invoices, and a karigar job so switching between them (as Super
// Admin, via the store switcher) shows real, differing data across the
// Ledger, Customers, Billing, and Karigar Management pages. Safe to re-run:
// everything is upserted/cleared-and-recreated by a stable natural key
// (store code, customer phone, invoice number, karigar code).
import {
  PrismaClient,
  BusinessUnit,
  LedgerEntryType,
  LedgerSourceType,
  InvoiceStatus,
  PurityType,
} from "@prisma/client";

const prisma = new PrismaClient();

type LedgerSeed = {
  type: LedgerEntryType;
  metal?: string;
  amount?: number;
  weight?: number;
  description: string;
};

type InvoiceSeed = {
  customerIndex: number;
  daysAgo: number;
  status: InvoiceStatus;
  items: {
    itemName: string;
    metal?: string;
    weight?: number;
    rate?: number;
    making?: number;
    stoneCharge?: number;
  }[];
};

type KarigarSeed = {
  code: string;
  name: string;
  mobile: string;
  metal?: string;
  issueWeight?: number;
  receiveWeight?: number;
  labourCharge: number;
  received: boolean;
};

type DemoStore = {
  code: string;
  name: string;
  businessUnits: BusinessUnit[];
  metals: string[];
  customers: {
    name: string;
    phone: string;
    openingBalance?: number;
    entries: LedgerSeed[];
  }[];
  invoices: InvoiceSeed[];
  karigar?: KarigarSeed;
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
    invoices: [
      {
        customerIndex: 0,
        daysAgo: 8,
        status: InvoiceStatus.PAID,
        items: [{ itemName: "Gold Ring 22K", metal: "Gold", weight: 5.2, rate: 6450, making: 900 }],
      },
      {
        customerIndex: 1,
        daysAgo: 4,
        status: InvoiceStatus.PARTIAL,
        items: [{ itemName: "Gold Chain 22K", metal: "Gold", weight: 15.6, rate: 6450, making: 2500 }],
      },
      {
        customerIndex: 0,
        daysAgo: 1,
        status: InvoiceStatus.DRAFT,
        items: [{ itemName: "Gold Bangle Pair", metal: "Gold", weight: 22.4, rate: 6450, making: 3200 }],
      },
    ],
    karigar: {
      code: "DEMO-GOLD-K1",
      name: "Demo Gold Karigar",
      mobile: "7100000001",
      metal: "Gold",
      issueWeight: 30,
      receiveWeight: 28.5,
      labourCharge: 4200,
      received: true,
    },
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
    invoices: [
      {
        customerIndex: 0,
        daysAgo: 6,
        status: InvoiceStatus.PAID,
        items: [{ itemName: "Silver Anklet Pair", metal: "Silver", weight: 40, rate: 96, making: 500 }],
      },
      {
        customerIndex: 1,
        daysAgo: 2,
        status: InvoiceStatus.PARTIAL,
        items: [{ itemName: "Silver Utensil Set", metal: "Silver", weight: 620, rate: 96, making: 1500 }],
      },
    ],
    karigar: {
      code: "DEMO-SILVER-K1",
      name: "Demo Silver Karigar",
      mobile: "7100000002",
      metal: "Silver",
      issueWeight: 500,
      labourCharge: 2800,
      received: false,
    },
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
    invoices: [
      {
        customerIndex: 0,
        daysAgo: 5,
        status: InvoiceStatus.PARTIAL,
        items: [
          { itemName: "Diamond Solitaire Ring", metal: "Diamond", weight: 2.5, rate: 6450, stoneCharge: 145000 },
        ],
      },
    ],
    karigar: {
      code: "DEMO-DIAMOND-K1",
      name: "Demo Diamond Setter",
      mobile: "7100000003",
      labourCharge: 3500,
      received: true,
    },
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
      {
        name: "Demo Mixed Customer 2",
        phone: "7000000007",
        entries: [
          { type: LedgerEntryType.DEBIT, metal: "Silver", weight: 60, description: "Silver item sale — 60g owed" },
        ],
      },
    ],
    invoices: [
      {
        customerIndex: 0,
        daysAgo: 7,
        status: InvoiceStatus.PAID,
        items: [{ itemName: "Gold Earrings 22K", metal: "Gold", weight: 8.4, rate: 6450, making: 1200 }],
      },
      {
        customerIndex: 1,
        daysAgo: 3,
        status: InvoiceStatus.PARTIAL,
        items: [{ itemName: "Silver Bracelet", metal: "Silver", weight: 55, rate: 96, making: 400 }],
      },
      {
        customerIndex: 0,
        daysAgo: 1,
        status: InvoiceStatus.DRAFT,
        items: [
          { itemName: "Diamond Pendant", metal: "Diamond", weight: 1.8, rate: 6450, stoneCharge: 62000 },
        ],
      },
    ],
    karigar: {
      code: "DEMO-MIXED-K1",
      name: "Demo Mixed Karigar",
      mobile: "7100000004",
      metal: "Gold",
      issueWeight: 20,
      receiveWeight: 19,
      labourCharge: 3000,
      received: true,
    },
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

  // Customers + manual ledger entries
  const customerRows = [];
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
    customerRows.push(customer);

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

  // Invoices + invoice items + sale ledger entries
  let invoiceCounter = 1;
  for (const seed of demo.invoices) {
    const invoiceNumber = `${demo.code}-INV-${String(invoiceCounter).padStart(3, "0")}`;
    invoiceCounter += 1;

    const existing = await prisma.invoice.findUnique({
      where: { storeId_invoiceNumber: { storeId: store.id, invoiceNumber } },
    });
    if (existing) {
      await prisma.ledgerEntry.deleteMany({ where: { storeId: store.id, invoiceId: existing.id } });
      await prisma.invoiceItem.deleteMany({ where: { invoiceId: existing.id } });
      await prisma.invoice.delete({ where: { id: existing.id } });
    }

    const subtotal = seed.items.reduce((sum, item) => sum + (item.weight ?? 0) * (item.rate ?? 0), 0);
    const makingCharges = seed.items.reduce((sum, item) => sum + (item.making ?? 0), 0);
    const stoneCharges = seed.items.reduce((sum, item) => sum + (item.stoneCharge ?? 0), 0);
    const totalAmount = subtotal + makingCharges + stoneCharges;

    const paidAmount =
      seed.status === InvoiceStatus.PAID
        ? totalAmount
        : seed.status === InvoiceStatus.PARTIAL
          ? Math.round(totalAmount * 0.5)
          : 0;
    const balanceAmount = totalAmount - paidAmount;
    const invoiceDate = daysAgo(seed.daysAgo);
    const customer = customerRows[seed.customerIndex];

    const invoice = await prisma.invoice.create({
      data: {
        storeId: store.id,
        invoiceNumber,
        customerId: customer.id,
        invoiceDate,
        status: seed.status,
        subtotal,
        makingCharges,
        stoneCharges,
        totalAmount,
        paidAmount,
        balanceAmount,
        items: {
          create: seed.items.map((item) => ({
            itemName: item.itemName,
            metalTypeId: item.metal ? metalIdByName.get(item.metal) : undefined,
            quantity: 1,
            netWeight: item.weight,
            rate: item.rate,
            makingCharge: item.making ?? 0,
            stoneCharge: item.stoneCharge ?? 0,
            lineTotal: (item.weight ?? 0) * (item.rate ?? 0) + (item.making ?? 0) + (item.stoneCharge ?? 0),
            purity: item.metal === "Gold" ? PurityType.GOLD_22K : undefined,
          })),
        },
      },
    });

    await prisma.ledgerEntry.create({
      data: {
        storeId: store.id,
        entryDate: invoiceDate,
        type: LedgerEntryType.DEBIT,
        sourceType: LedgerSourceType.SALE,
        customerId: customer.id,
        invoiceId: invoice.id,
        amount: totalAmount,
        description: `Sale via ${invoiceNumber}`,
      },
    });

    if (paidAmount > 0) {
      await prisma.ledgerEntry.create({
        data: {
          storeId: store.id,
          entryDate: invoiceDate,
          type: LedgerEntryType.CREDIT,
          sourceType: LedgerSourceType.SALE,
          customerId: customer.id,
          invoiceId: invoice.id,
          amount: paidAmount,
          description: `Payment received against ${invoiceNumber}`,
        },
      });
    }
  }

  // Karigar + job + issue/receipt ledger entries
  if (demo.karigar) {
    const k = demo.karigar;

    const karigar = await prisma.karigar.upsert({
      where: { storeId_code: { storeId: store.id, code: k.code } },
      update: { name: k.name, mobile: k.mobile },
      create: {
        storeId: store.id,
        code: k.code,
        name: k.name,
        mobile: k.mobile,
      },
    });

    const jobNumber = `${demo.code}-JOB-001`;
    const existingJob = await prisma.karigarJob.findFirst({
      where: { storeId: store.id, jobNumber },
    });
    if (existingJob) {
      await prisma.ledgerEntry.deleteMany({ where: { storeId: store.id, karigarId: karigar.id } });
      await prisma.karigarJob.delete({ where: { id: existingJob.id } });
    }

    const metalTypeId = k.metal ? metalIdByName.get(k.metal) : undefined;
    const issueDate = daysAgo(9);

    await prisma.karigarJob.create({
      data: {
        storeId: store.id,
        jobNumber,
        karigarId: karigar.id,
        issueDate,
        receivedDate: k.received ? new Date() : undefined,
        metalTypeId,
        issueWeight: k.issueWeight,
        receiveWeight: k.received ? k.receiveWeight : undefined,
        labourCharge: k.labourCharge,
        status: k.received ? "received" : "issued",
      },
    });

    await prisma.ledgerEntry.create({
      data: {
        storeId: store.id,
        entryDate: issueDate,
        type: LedgerEntryType.DEBIT,
        sourceType: LedgerSourceType.KARIGAR_ISSUE,
        karigarId: karigar.id,
        metalTypeId,
        metalWeight: k.issueWeight,
        amount: k.labourCharge,
        description: `Material/work issued for ${jobNumber}`,
      },
    });

    if (k.received) {
      await prisma.ledgerEntry.create({
        data: {
          storeId: store.id,
          entryDate: new Date(),
          type: LedgerEntryType.CREDIT,
          sourceType: LedgerSourceType.KARIGAR_RECEIPT,
          karigarId: karigar.id,
          metalTypeId,
          metalWeight: k.receiveWeight,
          amount: 0,
          description: `Finished goods received for ${jobNumber}`,
        },
      });
    }
  }

  console.log(
    `Seeded ${demo.code} — units: ${demo.businessUnits.join(", ")}, customers: ${demo.customers.length}, invoices: ${demo.invoices.length}, karigar: ${demo.karigar ? "yes" : "no"}`
  );
}

async function main() {
  for (const demo of STORES) {
    await seedStore(demo);
  }
}

main()
  .then(async () => {
    console.log("Business-units demo stores ready. Switch stores as Super Admin to explore each one's Ledger/Customers/Billing/Karigar Management.");
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("Business-units demo seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
