-- CreateTable
CREATE TABLE "StoreLocation" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreLocation_storeId_name_key" ON "StoreLocation"("storeId", "name");

-- AddForeignKey
ALTER TABLE "StoreLocation" ADD CONSTRAINT "StoreLocation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: turn every distinct existing free-text InventoryStock.location value
-- into a real StoreLocation row, scoped per store, before the column is dropped.
INSERT INTO "StoreLocation" ("id", "storeId", "name", "isActive", "createdAt", "updatedAt")
SELECT DISTINCT gen_random_uuid()::text, "storeId", "location", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryStock"
WHERE "location" IS NOT NULL AND "location" != '';

-- AlterTable
ALTER TABLE "InventoryStock" ADD COLUMN "locationId" TEXT;

-- Backfill: point each InventoryStock row at the StoreLocation row that now
-- matches its old free-text value.
UPDATE "InventoryStock" is_
SET "locationId" = sl."id"
FROM "StoreLocation" sl
WHERE sl."storeId" = is_."storeId" AND sl."name" = is_."location";

-- DropIndex
DROP INDEX "InventoryStock_location_idx";

-- AlterTable
ALTER TABLE "InventoryStock" DROP COLUMN "location";

-- CreateIndex
CREATE INDEX "InventoryStock_locationId_idx" ON "InventoryStock"("locationId");

-- AddForeignKey
ALTER TABLE "InventoryStock" ADD CONSTRAINT "InventoryStock_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StoreLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
