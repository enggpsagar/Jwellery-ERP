-- CreateTable
CREATE TABLE "StoreStyle" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreStyle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreStyle_storeId_name_key" ON "StoreStyle"("storeId", "name");

-- AddForeignKey
ALTER TABLE "StoreStyle" ADD CONSTRAINT "StoreStyle_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed the same four styles every store already implicitly had via the old
-- TargetStyle enum, so existing products have somewhere to map to below.
INSERT INTO "StoreStyle" ("id", "storeId", "name", "isActive", "createdAt", "updatedAt")
SELECT md5(random()::text || clock_timestamp()::text || s."id" || v.name), s."id", v.name, true, now(), now()
FROM "Store" s
CROSS JOIN (VALUES ('Ladies'), ('Gents'), ('Kids'), ('Unisex')) AS v(name);

-- AlterTable: new FK column alongside the old enum column
ALTER TABLE "Product" ADD COLUMN "targetStyleId" TEXT;

-- Backfill: map every existing Product's old enum value to the matching
-- newly-seeded StoreStyle row in its own store.
UPDATE "Product" p
SET "targetStyleId" = ss."id"
FROM "StoreStyle" ss
WHERE ss."storeId" = p."storeId"
  AND p."targetStyle" IS NOT NULL
  AND ss."name" = CASE p."targetStyle"
    WHEN 'LADIES' THEN 'Ladies'
    WHEN 'GENTS' THEN 'Gents'
    WHEN 'KIDS' THEN 'Kids'
    WHEN 'UNISEX' THEN 'Unisex'
  END;

-- Drop the old enum column and type — fully replaced by targetStyleId now.
ALTER TABLE "Product" DROP COLUMN "targetStyle";
DROP TYPE "TargetStyle";

-- CreateIndex
CREATE INDEX "Product_targetStyleId_idx" ON "Product"("targetStyleId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_targetStyleId_fkey" FOREIGN KEY ("targetStyleId") REFERENCES "StoreStyle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
