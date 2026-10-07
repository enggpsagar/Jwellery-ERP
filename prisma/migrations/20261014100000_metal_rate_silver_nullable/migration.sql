-- Market silver was never fetched before 8 Oct 2026: the cron stored a
-- hard-coded 120.00 "temporary" value in every store's MetalRate row. Make
-- the column nullable and clear exactly those placeholder values; the gold
-- columns of the same rows are real and stay.
ALTER TABLE "MetalRate" ALTER COLUMN "silver" DROP NOT NULL;
UPDATE "MetalRate" SET "silver" = NULL WHERE "silver" = 120.00 AND "createdAt" < '2026-10-08';
