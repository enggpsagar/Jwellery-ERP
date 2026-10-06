-- History of each store's own selling rates (see SellingRateEntry in
-- schema.prisma). Additive only: a new table, nothing existing changes.
CREATE TABLE "SellingRateEntry" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "sellingPrice" DECIMAL(12,2),
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellingRateEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SellingRateEntry_storeId_createdAt_idx" ON "SellingRateEntry"("storeId", "createdAt");

ALTER TABLE "SellingRateEntry" ADD CONSTRAINT "SellingRateEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
