-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "gstRateId" TEXT,
ADD COLUMN     "gstRateName" TEXT,
ADD COLUMN     "gstRatePercent" DECIMAL(5,2);

-- CreateIndex
CREATE INDEX "InvoiceItem_gstRateId_idx" ON "InvoiceItem"("gstRateId");

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_gstRateId_fkey" FOREIGN KEY ("gstRateId") REFERENCES "GstRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
