-- CreateTable
CREATE TABLE "GstRate" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ratePercent" DECIMAL(5,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GstRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GstRate_storeId_idx" ON "GstRate"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "GstRate_storeId_name_key" ON "GstRate"("storeId", "name");

-- AddForeignKey
ALTER TABLE "GstRate" ADD CONSTRAINT "GstRate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "gstRateId" TEXT,
ADD COLUMN     "gstRateName" TEXT,
ADD COLUMN     "gstRatePercent" DECIMAL(5,2);

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_gstRateId_fkey" FOREIGN KEY ("gstRateId") REFERENCES "GstRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "gstRateId" TEXT,
ADD COLUMN     "gstRateName" TEXT,
ADD COLUMN     "gstRatePercent" DECIMAL(5,2);

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_gstRateId_fkey" FOREIGN KEY ("gstRateId") REFERENCES "GstRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "gstRateId" TEXT,
ADD COLUMN     "gstRateName" TEXT,
ADD COLUMN     "gstRatePercent" DECIMAL(5,2);

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_gstRateId_fkey" FOREIGN KEY ("gstRateId") REFERENCES "GstRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DataMigration: seed one "Standard" GstRate per store from the old flat
-- BusinessSettings.defaultGstRate, marked as the default pick — so every
-- existing store keeps behaving exactly as it already did (same % applied)
-- the moment this ships, with the new multi-rate picker just showing the
-- one rate they already had until they add more in Settings.
INSERT INTO "GstRate" ("id", "storeId", "name", "ratePercent", "isActive", "isDefault", "createdAt", "updatedAt")
SELECT
    'gstrate_' || bs."storeId",
    bs."storeId",
    'Standard',
    bs."defaultGstRate"::decimal(5,2),
    true,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "BusinessSettings" bs
ON CONFLICT ("storeId", "name") DO NOTHING;
