-- "Ignore" for the purity fineness warning (Settings > Metals & Categories):
-- the fineness value the Store Owner accepted. Additive, nullable, no data change.
ALTER TABLE "StoreMetalPurity" ADD COLUMN "finenessCheckIgnoredAt" DECIMAL(5,2);
