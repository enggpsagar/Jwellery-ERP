-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_gstRateId_fkey";

-- DropIndex
DROP INDEX "Product_gstRateId_idx";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "gstRateId";

-- AlterTable
ALTER TABLE "ProductMetalComponent" ADD COLUMN     "gstRateId" TEXT;

-- AlterTable
ALTER TABLE "ProductStoneComponent" ADD COLUMN     "gstRateId" TEXT;

-- CreateIndex
CREATE INDEX "ProductMetalComponent_gstRateId_idx" ON "ProductMetalComponent"("gstRateId");

-- CreateIndex
CREATE INDEX "ProductStoneComponent_gstRateId_idx" ON "ProductStoneComponent"("gstRateId");

-- AddForeignKey
ALTER TABLE "ProductMetalComponent" ADD CONSTRAINT "ProductMetalComponent_gstRateId_fkey" FOREIGN KEY ("gstRateId") REFERENCES "GstRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStoneComponent" ADD CONSTRAINT "ProductStoneComponent_gstRateId_fkey" FOREIGN KEY ("gstRateId") REFERENCES "GstRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
