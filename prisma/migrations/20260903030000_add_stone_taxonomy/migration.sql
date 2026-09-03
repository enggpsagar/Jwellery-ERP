-- CreateEnum
CREATE TYPE "StoneOrigin" AS ENUM ('NATURAL', 'LAB_GROWN');

-- AlterTable
ALTER TABLE "StoreMetal" ADD COLUMN     "isGemstone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stoneOrigin" "StoneOrigin";

-- Backfill: a StoreMetal row already named exactly "Diamond" or "Stone"
-- (case-insensitive) is unambiguously a gemstone under the app's existing
-- name-based heuristics (classifyMetalName / isCaratWeighedMetal /
-- product-form's classifyPurityFamily) — flip it to isGemstone=true so it
-- shows up under Settings' new Stones section instead of Metals, with zero
-- change to its metalTypeId FK or any product/stock/invoice/purchase row
-- that already points at it.
--
-- Deliberately an EXACT name match, not the app's broader substring match
-- (which would also catch a compound name like "Gold/Diamond" — a real row
-- in this database, tracked as Gold-family purity today). Flagging that row
-- as a gemstone here would silently change which purities/carat-weight UI
-- it offers going forward. Left alone; the store can reclassify it by hand
-- from Settings if they actually mean a stand-alone stone.
--
-- stoneOrigin is intentionally left NULL by this backfill — see the column
-- comment on StoreMetal.stoneOrigin in schema.prisma.
UPDATE "StoreMetal" SET "isGemstone" = true WHERE lower(name) IN ('diamond', 'stone');
