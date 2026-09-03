import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Staff user "ram" (restricted to one location) created these two invoices
// before resolveWritableLocationId() existed — both saved with
// locationId: null, which never matches their own location-scoped invoice
// list (Prisma's `in` filter never matches null). Confirmed via direct query:
// both belong to this exact user, this exact store, and this is their only
// granted location.
const INVOICE_IDS = ["cmtl9yju30001ie04wncud281", "cmtl9zuff0001jo04jr4osotl"];
const CORRECT_LOCATION_ID = "cmtil9whz0008l504u7zl2idr";

async function main() {
  const before = await prisma.invoice.findMany({
    where: { id: { in: INVOICE_IDS } },
    select: { id: true, invoiceNumber: true, locationId: true },
  });
  console.log("BEFORE:", JSON.stringify(before));

  if (before.length !== INVOICE_IDS.length) {
    throw new Error("One or both invoices not found — aborting without changes.");
  }
  if (before.some((inv) => inv.locationId !== null)) {
    throw new Error("At least one invoice already has a locationId set — aborting to avoid overwriting unrelated data.");
  }

  const result = await prisma.invoice.updateMany({
    where: { id: { in: INVOICE_IDS } },
    data: { locationId: CORRECT_LOCATION_ID },
  });
  console.log("Updated count:", result.count);

  const after = await prisma.invoice.findMany({
    where: { id: { in: INVOICE_IDS } },
    select: { id: true, invoiceNumber: true, locationId: true },
  });
  console.log("AFTER:", JSON.stringify(after));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
