-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "locationId" TEXT;

-- CreateIndex
CREATE INDEX "Quotation_locationId_idx" ON "Quotation"("locationId");

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StoreLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
