-- Finish (Unfinished / Finished-Hallmarked) chosen on the product master and
-- inherited by stock entries created from it. Existing products default to
-- KACHA, matching InventoryStock.finish's own default.
ALTER TABLE "Product" ADD COLUMN "defaultFinish" "InventoryFinish" NOT NULL DEFAULT 'KACHA';
