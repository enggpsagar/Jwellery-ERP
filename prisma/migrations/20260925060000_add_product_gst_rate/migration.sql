-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "gstRateId" TEXT;

-- CreateIndex
CREATE INDEX "Product_gstRateId_idx" ON "Product"("gstRateId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_gstRateId_fkey" FOREIGN KEY ("gstRateId") REFERENCES "GstRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
