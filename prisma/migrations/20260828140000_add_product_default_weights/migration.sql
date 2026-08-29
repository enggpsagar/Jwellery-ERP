-- Default weights carried on the product, used to prefill stock entries.
-- Nullable with no default: an existing product has no recorded weight, and
-- writing 0 would claim it weighs nothing rather than that it is unknown.
ALTER TABLE "Product" ADD COLUMN "defaultGrossWeight" DECIMAL(10,3);
ALTER TABLE "Product" ADD COLUMN "defaultNetWeight" DECIMAL(10,3);
ALTER TABLE "Product" ADD COLUMN "defaultStoneWeight" DECIMAL(10,3);
