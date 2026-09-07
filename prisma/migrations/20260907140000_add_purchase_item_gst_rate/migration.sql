-- AlterTable
ALTER TABLE "PurchaseItem" ADD COLUMN     "sgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "cgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "igstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "gstRateId" TEXT,
ADD COLUMN     "gstRateName" TEXT,
ADD COLUMN     "gstRatePercent" DECIMAL(5,2);

-- CreateIndex
CREATE INDEX "PurchaseItem_gstRateId_idx" ON "PurchaseItem"("gstRateId");

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_gstRateId_fkey" FOREIGN KEY ("gstRateId") REFERENCES "GstRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
