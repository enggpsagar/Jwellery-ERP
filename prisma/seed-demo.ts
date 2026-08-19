import {
  PrismaClient,
  MetalType,
  PurityType,
  InvoiceStatus,
  LedgerEntryType,
  LedgerSourceType,
} from "@prisma/client";

const prisma = new PrismaClient();

const CUSTOMERS = [
  {
    name: "Anita Sharma",
    phone: "9820011223",
    email: "anita.sharma@example.com",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400001",
    openingBalance: 5000,
  },
  {
    name: "Ravi Kumar",
    phone: "9845123456",
    email: "ravi.kumar@example.com",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560001",
    openingBalance: 0,
  },
  {
    name: "Priya Desai",
    phone: "9909876543",
    email: "priya.desai@example.com",
    city: "Ahmedabad",
    state: "Gujarat",
    pincode: "380001",
    openingBalance: 12000,
  },
  {
    name: "Suresh Iyer",
    phone: "9444556677",
    email: "suresh.iyer@example.com",
    city: "Chennai",
    state: "Tamil Nadu",
    pincode: "600001",
    openingBalance: 0,
  },
  {
    name: "Meena Agarwal",
    phone: "9312345678",
    email: "meena.agarwal@example.com",
    city: "Delhi",
    state: "Delhi",
    pincode: "110001",
    openingBalance: 3500,
  },
  {
    name: "Vikram Singh",
    phone: "9765432109",
    email: "vikram.singh@example.com",
    city: "Jaipur",
    state: "Rajasthan",
    pincode: "302001",
    openingBalance: 0,
  },
];

const KARIGARS = [
  {
    code: "KGR-001",
    name: "Ramesh Sonar",
    mobile: "9820098765",
    specialization: "Ring & Bangle making",
    city: "Mumbai",
    openingGold: 12.5,
    openingCash: 0,
  },
  {
    code: "KGR-002",
    name: "Ganesh Patil",
    mobile: "9876554321",
    specialization: "Necklace & Chain",
    city: "Pune",
    openingGold: 0,
    openingCash: 5000,
  },
  {
    code: "KGR-003",
    name: "Iqbal Ansari",
    mobile: "9988776655",
    specialization: "Stone setting",
    city: "Surat",
    openingGold: 3.2,
    openingCash: 0,
  },
];

function daysAgoDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

async function seedCustomers(storeId: string) {
  console.log("Seeding customers...");

  const customers = [];

  for (const c of CUSTOMERS) {
    const existing = await prisma.customer.findFirst({
      where: { storeId, phone: c.phone },
    });

    const customer =
      existing ??
      (await prisma.customer.create({ data: { ...c, storeId } }));
    customers.push(customer);
  }

  console.log(`Seeded ${customers.length} customers.`);
  return customers;
}

async function seedKarigars(storeId: string) {
  console.log("Seeding karigars...");

  const karigars = [];

  for (const k of KARIGARS) {
    const karigar = await prisma.karigar.upsert({
      where: { storeId_code: { storeId, code: k.code } },
      update: {},
      create: { ...k, storeId },
    });
    karigars.push(karigar);
  }

  console.log(`Seeded ${karigars.length} karigars.`);
  return karigars;
}

async function seedInvoicesAndLedger(
  customers: Awaited<ReturnType<typeof seedCustomers>>,
  karigars: Awaited<ReturnType<typeof seedKarigars>>,
  storeId: string
) {
  console.log("Seeding invoices, invoice items and ledger entries...");

  const stockItems = await prisma.inventoryStock.findMany({
    where: { storeId },
    take: 10,
    include: { product: true },
  });

  const invoiceSeeds = [
    {
      customer: customers[0],
      daysAgo: 12,
      status: InvoiceStatus.PAID,
      items: [
        { itemName: "Classic Gold Ring", weight: 5.2, rate: 6450, making: 900 },
      ],
    },
    {
      customer: customers[1],
      daysAgo: 9,
      status: InvoiceStatus.PARTIAL,
      items: [
        { itemName: "Lakshmi Necklace Set", weight: 18.5, rate: 6450, making: 4500 },
      ],
    },
    {
      customer: customers[2],
      daysAgo: 6,
      status: InvoiceStatus.PAID,
      items: [
        { itemName: "Gold Bangle Pair", weight: 22.4, rate: 6450, making: 3200 },
      ],
    },
    {
      customer: customers[3],
      daysAgo: 4,
      status: InvoiceStatus.DRAFT,
      items: [
        { itemName: "Silver Anklet", weight: 40, rate: 96, making: 500 },
      ],
    },
    {
      customer: customers[4],
      daysAgo: 2,
      status: InvoiceStatus.PARTIAL,
      items: [
        { itemName: "Diamond Stud Earrings", weight: 3.1, rate: 6660, making: 2100 },
      ],
    },
    {
      customer: customers[5],
      daysAgo: 0,
      status: InvoiceStatus.PAID,
      items: [
        { itemName: "Gold Chain 22K", weight: 15.6, rate: 6660, making: 2500 },
      ],
    },
  ];

  let invoiceCounter = 1;

  for (const seed of invoiceSeeds) {
    const invoiceNumber = `INV-2026-${String(invoiceCounter).padStart(4, "0")}`;
    invoiceCounter += 1;

    const subtotal = seed.items.reduce(
      (sum, item) => sum + item.weight * item.rate,
      0
    );
    const makingCharges = seed.items.reduce((sum, item) => sum + item.making, 0);
    const totalAmount = subtotal + makingCharges;

    const paidAmount =
      seed.status === InvoiceStatus.PAID
        ? totalAmount
        : seed.status === InvoiceStatus.PARTIAL
          ? Math.round(totalAmount * 0.5)
          : 0;

    const balanceAmount = totalAmount - paidAmount;
    const invoiceDate = daysAgoDate(seed.daysAgo);

    const existing = await prisma.invoice.findUnique({
      where: { storeId_invoiceNumber: { storeId, invoiceNumber } },
    });

    if (existing) continue;

    const invoice = await prisma.invoice.create({
      data: {
        storeId,
        invoiceNumber,
        customerId: seed.customer.id,
        invoiceDate,
        status: seed.status,
        subtotal,
        makingCharges,
        totalAmount,
        paidAmount,
        balanceAmount,
        items: {
          create: seed.items.map((item) => ({
            itemName: item.itemName,
            metalType: item.itemName.toLowerCase().includes("silver")
              ? MetalType.SILVER
              : MetalType.GOLD,
            quantity: 1,
            netWeight: item.weight,
            rate: item.rate,
            makingCharge: item.making,
            lineTotal: item.weight * item.rate + item.making,
            purity: item.itemName.toLowerCase().includes("silver")
              ? undefined
              : PurityType.GOLD_22K,
          })),
        },
      },
    });

    await prisma.ledgerEntry.create({
      data: {
        storeId,
        entryDate: invoiceDate,
        type: LedgerEntryType.DEBIT,
        sourceType: LedgerSourceType.SALE,
        customerId: seed.customer.id,
        invoiceId: invoice.id,
        amount: totalAmount,
        description: `Sale via ${invoiceNumber}`,
      },
    });

    if (paidAmount > 0) {
      await prisma.ledgerEntry.create({
        data: {
          storeId,
          entryDate: invoiceDate,
          type: LedgerEntryType.CREDIT,
          sourceType: LedgerSourceType.SALE,
          customerId: seed.customer.id,
          invoiceId: invoice.id,
          amount: paidAmount,
          description: `Payment received against ${invoiceNumber}`,
        },
      });
    }
  }

  console.log(`Seeded ${invoiceSeeds.length} invoices with ledger entries.`);

  const karigarJobSeeds = [
    {
      karigar: karigars[0],
      daysAgo: 10,
      metalType: MetalType.GOLD,
      issueWeight: 25,
      labourCharge: 3500,
      status: "issued",
      stockId: stockItems[0]?.id,
    },
    {
      karigar: karigars[1],
      daysAgo: 5,
      metalType: MetalType.GOLD,
      issueWeight: 40,
      receiveWeight: 38.5,
      labourCharge: 6200,
      status: "received",
      stockId: stockItems[1]?.id,
    },
    {
      karigar: karigars[2],
      daysAgo: 2,
      metalType: MetalType.SILVER,
      issueWeight: 120,
      labourCharge: 1800,
      status: "issued",
      stockId: undefined,
    },
  ];

  let jobCounter = 1;

  for (const job of karigarJobSeeds) {
    const jobNumber = `JOB-2026-${String(jobCounter).padStart(4, "0")}`;
    jobCounter += 1;

    const existing = await prisma.karigarJob.findUnique({
      where: { storeId_jobNumber: { storeId, jobNumber } },
    });

    if (existing) continue;

    const issueDate = daysAgoDate(job.daysAgo);

    await prisma.karigarJob.create({
      data: {
        storeId,
        jobNumber,
        karigarId: job.karigar.id,
        issueDate,
        receivedDate: job.status === "received" ? new Date() : undefined,
        metalType: job.metalType,
        issueWeight: job.issueWeight,
        receiveWeight: job.receiveWeight,
        labourCharge: job.labourCharge,
        status: job.status,
        inventoryStockId: job.stockId,
      },
    });

    await prisma.ledgerEntry.create({
      data: {
        storeId,
        entryDate: issueDate,
        type: LedgerEntryType.DEBIT,
        sourceType: LedgerSourceType.KARIGAR_ISSUE,
        karigarId: job.karigar.id,
        metalType: job.metalType,
        metalWeight: job.issueWeight,
        amount: job.labourCharge,
        description: `Material issued for ${jobNumber}`,
      },
    });

    if (job.receiveWeight) {
      await prisma.ledgerEntry.create({
        data: {
          storeId,
          entryDate: new Date(),
          type: LedgerEntryType.CREDIT,
          sourceType: LedgerSourceType.KARIGAR_RECEIPT,
          karigarId: job.karigar.id,
          metalType: job.metalType,
          metalWeight: job.receiveWeight,
          amount: 0,
          description: `Finished goods received for ${jobNumber}`,
        },
      });
    }
  }

  console.log(`Seeded ${karigarJobSeeds.length} karigar jobs with ledger entries.`);
}

async function main() {
  const store = await prisma.store.upsert({
    where: { code: "MAIN" },
    update: {},
    create: { name: "Main Store", code: "MAIN" },
  });

  const customers = await seedCustomers(store.id);
  const karigars = await seedKarigars(store.id);
  await seedInvoicesAndLedger(customers, karigars, store.id);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("Demo seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
