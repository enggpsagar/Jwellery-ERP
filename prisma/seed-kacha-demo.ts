import {
  PrismaClient,
  InvoiceStatus,
  InventoryFinish,
  InventoryStockStatus,
  InventoryTransactionType,
  LedgerEntryType,
  LedgerSourceType,
} from "@prisma/client";

const prisma = new PrismaClient();

function daysAgoDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function lineTotal(netWeight: number, rate: number, makingCharge: number, stoneCharge = 0) {
  return netWeight * rate + makingCharge + stoneCharge;
}

async function nextSlipNumber() {
  const year = new Date().getFullYear();
  const count = await prisma.kachaInvoice.count({
    where: { slipNumber: { startsWith: `KACHA-${year}-` } },
  });
  return `KACHA-${year}-${String(count + 1).padStart(4, "0")}`;
}

async function nextInvoiceNumber() {
  const year = new Date().getFullYear();
  const count = await prisma.invoice.count({
    where: { invoiceNumber: { startsWith: `INV-${year}-` } },
  });
  return `INV-${year}-${String(count + 1).padStart(4, "0")}`;
}

async function markStockFinish() {
  console.log("Setting inventory stock finish variety...");

  const stock = await prisma.inventoryStock.findMany({
    where: { status: InventoryStockStatus.IN_STOCK },
    orderBy: { createdAt: "asc" },
  });

  // Alternate Kacha/Pakka so both badge states show up in the UI.
  for (const [index, item] of stock.entries()) {
    const finish = index % 2 === 0 ? InventoryFinish.PAKKA : InventoryFinish.KACHA;
    await prisma.inventoryStock.update({
      where: { id: item.id },
      data: { finish },
    });
  }

  console.log(`Updated finish on ${stock.length} stock items.`);
}

async function seedKachaSlips() {
  console.log("Seeding Kacha slips...");

  const customers = await prisma.customer.findMany({
    take: 4,
    orderBy: { createdAt: "asc" },
  });

  const stockItems = await prisma.inventoryStock.findMany({
    where: { status: InventoryStockStatus.IN_STOCK },
    include: { product: true },
    orderBy: { createdAt: "asc" },
  });

  if (customers.length < 3 || stockItems.length < 3) {
    console.log("Not enough customers/stock to seed Kacha slips — skipping.");
    return;
  }

  type SlipPlan = {
    customer: (typeof customers)[number];
    stock: (typeof stockItems)[number];
    daysAgo: number;
    paidRatio: number; // 0 = draft, 0-1 = partial, 1 = paid
    convertToPakka?: boolean;
  };

  const plans: SlipPlan[] = [
    { customer: customers[0], stock: stockItems[0], daysAgo: 8, paidRatio: 1, convertToPakka: true },
    { customer: customers[1], stock: stockItems[1], daysAgo: 5, paidRatio: 0.5 },
    { customer: customers[2], stock: stockItems[2], daysAgo: 2, paidRatio: 0 },
    { customer: customers[0], stock: stockItems[3] ?? stockItems[0], daysAgo: 1, paidRatio: 1 },
  ];

  for (const plan of plans) {
    const netWeight = Number(plan.stock.netWeight ?? 5);
    const rate = Number(plan.stock.saleRate ?? 6000);
    const makingCharge = Number(plan.stock.makingCharge ?? 500);
    const subtotal = netWeight * rate;
    const total = lineTotal(netWeight, rate, makingCharge);
    const paidAmount = Math.round(total * plan.paidRatio);
    const balanceAmount = Math.max(0, total - paidAmount);

    let status: InvoiceStatus = InvoiceStatus.PAID;
    if (balanceAmount > 0 && paidAmount > 0) status = InvoiceStatus.PARTIAL;
    else if (balanceAmount > 0 && paidAmount === 0) status = InvoiceStatus.DRAFT;

    const slipNumber = await nextSlipNumber();
    const invoiceDate = daysAgoDate(plan.daysAgo);

    const kachaInvoice = await prisma.$transaction(async (tx) => {
      const created = await tx.kachaInvoice.create({
        data: {
          slipNumber,
          customerId: plan.customer.id,
          invoiceDate,
          status,
          subtotal,
          makingCharges: makingCharge,
          stoneCharges: 0,
          discount: 0,
          totalAmount: total,
          paidAmount,
          balanceAmount,
          items: {
            create: [
              {
                itemName: plan.stock.product.name,
                metalType: plan.stock.metalType,
                purity: plan.stock.purity,
                quantity: 1,
                grossWeight: plan.stock.grossWeight ?? undefined,
                netWeight,
                rate,
                makingCharge,
                stoneCharge: 0,
                lineTotal: total,
                inventoryStockId: plan.stock.id,
              },
            ],
          },
        },
      });

      await tx.inventoryStock.update({
        where: { id: plan.stock.id },
        data: { status: InventoryStockStatus.SOLD, saleAmount: total },
      });

      await tx.inventoryTransaction.create({
        data: {
          inventoryStockId: plan.stock.id,
          transactionType: InventoryTransactionType.SALE,
          netWeight,
          referenceType: "KachaInvoice",
          referenceId: created.id,
        },
      });

      if (balanceAmount > 0) {
        await tx.ledgerEntry.create({
          data: {
            entryDate: invoiceDate,
            type: LedgerEntryType.DEBIT,
            sourceType: LedgerSourceType.SALE,
            customerId: plan.customer.id,
            amount: balanceAmount,
            description: `Kacha slip ${slipNumber} balance due`,
          },
        });
      }

      if (paidAmount > 0) {
        await tx.ledgerEntry.create({
          data: {
            entryDate: invoiceDate,
            type: LedgerEntryType.CREDIT,
            sourceType: LedgerSourceType.SALE,
            customerId: plan.customer.id,
            amount: paidAmount,
            description: `Payment received against ${slipNumber}`,
          },
        });
      }

      return created;
    });

    console.log(`Created ${slipNumber} (${status}) for ${plan.customer.name}`);

    if (plan.convertToPakka) {
      const taxAmount = Math.round(total * 0.03 * 100) / 100;
      const invoiceNumber = await nextInvoiceNumber();

      await prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber,
            customerId: plan.customer.id,
            invoiceDate,
            status,
            subtotal,
            makingCharges: makingCharge,
            stoneCharges: 0,
            discount: 0,
            taxAmount,
            totalAmount: total + taxAmount,
            paidAmount,
            balanceAmount: Math.max(0, total + taxAmount - paidAmount),
            notes: `Converted from Kacha slip ${slipNumber}`,
            items: {
              create: [
                {
                  itemName: plan.stock.product.name,
                  metalType: plan.stock.metalType,
                  purity: plan.stock.purity,
                  quantity: 1,
                  grossWeight: plan.stock.grossWeight ?? undefined,
                  netWeight,
                  rate,
                  makingCharge,
                  stoneCharge: 0,
                  lineTotal: total,
                  inventoryStockId: plan.stock.id,
                },
              ],
            },
          },
        });

        await tx.kachaInvoice.update({
          where: { id: kachaInvoice.id },
          data: { convertedToId: invoice.id },
        });

        console.log(`  -> Converted to ${invoiceNumber}`);
      });
    }
  }
}

async function main() {
  await markStockFinish();
  await seedKachaSlips();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("Kacha demo seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
