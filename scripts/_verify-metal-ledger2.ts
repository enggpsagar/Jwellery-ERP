import { PrismaClient } from "@prisma/client";
import { classifyMetalName, BUSINESS_UNIT_LABELS } from "../lib/business-units";
const prisma = new PrismaClient();

const storeId = "cmt8x1yv900116flena3l63ea"; // Demo - Money + Gold + Silver + Diamond

async function main() {
  const [purchaseItems, invoiceItems, kachaInvoiceItems] = await Promise.all([
    prisma.purchaseItem.findMany({
      where: { purchase: { storeId } },
      select: {
        netWeight: true, lineTotal: true,
        metalType: { select: { name: true } },
        purchase: { select: { purchaseDate: true } },
      },
    }),
    prisma.invoiceItem.findMany({
      where: { invoice: { storeId } },
      select: {
        netWeight: true, lineTotal: true,
        metalType: { select: { name: true } },
        invoice: { select: { invoiceDate: true } },
      },
    }),
    prisma.kachaInvoiceItem.findMany({
      where: { kachaInvoice: { storeId } },
      select: {
        netWeight: true, lineTotal: true,
        metalType: { select: { name: true } },
        kachaInvoice: { select: { invoiceDate: true } },
      },
    }),
  ]);

  console.log("invoiceItems sample:", invoiceItems.slice(0, 5).map(i => ({
    metal: i.metalType?.name, family: classifyMetalName(i.metalType?.name),
    netWeight: i.netWeight?.toString(), lineTotal: i.lineTotal.toString(),
    date: i.invoice.invoiceDate.toISOString().slice(0,10),
  })));
  console.log("purchaseItems:", purchaseItems.length, "kacha:", kachaInvoiceItems.length);
}

main().finally(() => prisma.$disconnect());
