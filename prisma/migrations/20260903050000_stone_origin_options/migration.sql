-- A gemstone StoreMetal row (Diamond, Ruby, ...) used to carry a single
-- nullable stoneOrigin column, forcing a store that deals in BOTH natural
-- and lab-grown Diamond to create two separate "Diamond" StoreMetal rows
-- just to express both origins. This migration replaces that single column
-- with a child table (StoreMetalOrigin), mirroring StoreCategoryType's
-- one-to-many shape under StoreCategory exactly, so a stone can carry
-- multiple independently manageable origin options. Product gains a
-- parallel stoneOriginOptionId FK (alongside the existing metalTypeId),
-- mirroring how it already carries categoryTypeId alongside categoryId.
--
-- Order matters: the new table/column are created and backfilled BEFORE the
-- old stoneOrigin column is dropped, so no data is lost in between.

-- CreateTable
CREATE TABLE "StoreMetalOrigin" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "storeMetalId" TEXT NOT NULL,
    "origin" "StoneOrigin" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreMetalOrigin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreMetalOrigin_storeMetalId_origin_key" ON "StoreMetalOrigin"("storeMetalId", "origin");

-- AddForeignKey
ALTER TABLE "StoreMetalOrigin" ADD CONSTRAINT "StoreMetalOrigin_storeMetalId_fkey" FOREIGN KEY ("storeMetalId") REFERENCES "StoreMetal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: new Product FK, added now so the backfill below (if it ever
-- needed to touch Product) and the app's generated client see it together
-- with the rest of this migration. No existing Product currently references
-- a gemstone metalTypeId (verified against the live DB before writing this
-- migration), so there is nothing to backfill on this column — it is simply
-- new, nullable, unset storage going forward.
ALTER TABLE "Product" ADD COLUMN     "stoneOriginOptionId" TEXT;

-- CreateIndex
CREATE INDEX "Product_stoneOriginOptionId_idx" ON "Product"("stoneOriginOptionId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_stoneOriginOptionId_fkey" FOREIGN KEY ("stoneOriginOptionId") REFERENCES "StoreMetalOrigin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: for every existing StoreMetal row with a non-null stoneOrigin,
-- create one corresponding StoreMetalOrigin child row carrying that same
-- origin value, so a store that already set e.g. Diamond -> Natural doesn't
-- lose that information — it just moves from the parent row to a proper
-- child option (which the store can now add a second, Lab-Grown, option
-- alongside). Same gen_random_uuid()::text id convention used by this
-- repo's other hand-written backfill migrations (see
-- 20260826180000_add_store_location).
INSERT INTO "StoreMetalOrigin" ("id", "storeId", "storeMetalId", "origin", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "storeId", "id", "stoneOrigin", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "StoreMetal"
WHERE "stoneOrigin" IS NOT NULL;

-- Drop the old single-value column only after the backfill INSERT above has
-- copied every existing origin value onto its new child row.
ALTER TABLE "StoreMetal" DROP COLUMN "stoneOrigin";
