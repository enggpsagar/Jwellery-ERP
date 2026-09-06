-- StoreMetalOrigin used to carry a fixed `origin` enum column
-- (NATURAL / LAB_GROWN only), the one place this schema's taxonomy diverged
-- from the free-text, Store-Admin-managed pattern every other taxonomy
-- child table uses (see StoreCategoryType.name). A store that wanted to
-- add e.g. "Moissanite" as a third Stone Type under Diamond had no way to
-- do so. This migration converts the column to free text, exactly
-- mirroring StoreCategoryType's shape.
--
-- Order matters: the new `name` column is added and backfilled from the
-- existing `origin` values BEFORE the old column/enum are dropped, so no
-- data is lost in between — same "backfill before tightening" order as
-- 20260903050000_stone_origin_options and 20260903070000_add_support_ticket_number.

-- AlterTable: add as nullable so existing rows can be backfilled first
ALTER TABLE "StoreMetalOrigin" ADD COLUMN     "name" TEXT;

-- Backfill: capitalize the old fixed enum values into human-readable free
-- text, matching how a Store Admin would type a Category Type name.
UPDATE "StoreMetalOrigin" SET "name" = 'Natural' WHERE "origin" = 'NATURAL';
UPDATE "StoreMetalOrigin" SET "name" = 'Lab-Grown' WHERE "origin" = 'LAB_GROWN';

-- AlterTable: now that every row has a value, tighten to NOT NULL
ALTER TABLE "StoreMetalOrigin" ALTER COLUMN "name" SET NOT NULL;

-- DropIndex: the old (storeMetalId, origin) uniqueness constraint
DROP INDEX "StoreMetalOrigin_storeMetalId_origin_key";

-- AlterTable: drop the old fixed-enum column
ALTER TABLE "StoreMetalOrigin" DROP COLUMN "origin";

-- DropEnum: nothing else references StoneOrigin once the column above is gone
DROP TYPE "StoneOrigin";

-- CreateIndex: the new (storeMetalId, name) uniqueness constraint, mirroring
-- StoreCategoryType_categoryId_name_key
CREATE UNIQUE INDEX "StoreMetalOrigin_storeMetalId_name_key" ON "StoreMetalOrigin"("storeMetalId", "name");
