-- "Purchased From" on a hand-typed Kacha slip / Quotation line: which party
-- the piece (and its metal) came in from. Nullable — existing lines predate
-- it, and stock-linked lines take theirs from InventoryStock.vendorId.

-- AlterTable
ALTER TABLE "KachaInvoiceItem" ADD COLUMN "vendorId" TEXT,
ADD COLUMN "vendorName" TEXT;

-- AlterTable
ALTER TABLE "QuotationItem" ADD COLUMN "vendorId" TEXT,
ADD COLUMN "vendorName" TEXT;

-- CreateIndex
CREATE INDEX "KachaInvoiceItem_vendorId_idx" ON "KachaInvoiceItem"("vendorId");

-- CreateIndex
CREATE INDEX "QuotationItem_vendorId_idx" ON "QuotationItem"("vendorId");

-- AddForeignKey
ALTER TABLE "KachaInvoiceItem" ADD CONSTRAINT "KachaInvoiceItem_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
