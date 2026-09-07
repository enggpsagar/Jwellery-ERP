-- Optional 1:1 link between a Customer row and a Vendor row representing
-- the same real-world person/business (see Customer.linkedVendorId's doc
-- comment in schema.prisma).
ALTER TABLE "Customer" ADD COLUMN "linkedVendorId" TEXT;

CREATE UNIQUE INDEX "Customer_linkedVendorId_key" ON "Customer"("linkedVendorId");

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_linkedVendorId_fkey" FOREIGN KEY ("linkedVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
