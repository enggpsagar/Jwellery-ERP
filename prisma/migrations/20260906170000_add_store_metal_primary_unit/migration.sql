-- CreateEnum
CREATE TYPE "WeightUnit" AS ENUM ('GRAM', 'CARAT');

-- AlterTable
ALTER TABLE "StoreMetal" ADD COLUMN     "primaryUnit" "WeightUnit" NOT NULL DEFAULT 'GRAM';

-- Backfill: existing gemstone rows default to Carat, matching how they were
-- already implicitly treated everywhere carat-weighed math applied; every
-- other metal keeps the column default (Gram).
UPDATE "StoreMetal" SET "primaryUnit" = 'CARAT' WHERE "isGemstone" = true;
