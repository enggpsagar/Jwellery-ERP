-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "isGstRegistered" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "isGstRegistered" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: a store already on REGULAR_B2B was, until now, treating every
-- one of its customers/vendors as GSTIN-required store-wide. Moving that
-- decision to the per-record level must not silently flip existing
-- customers/vendors to "not GST-registered" — so any store currently on
-- REGULAR_B2B backfills all of its own customers/vendors to true. Every
-- other store's records (B2C or Composition) correctly keep the false
-- default, since GSTIN was never required for them either way.
UPDATE "Customer" c
SET "isGstRegistered" = true
FROM "BusinessSettings" bs
WHERE bs."storeId" = c."storeId" AND bs."gstScheme" = 'REGULAR_B2B';

UPDATE "Vendor" v
SET "isGstRegistered" = true
FROM "BusinessSettings" bs
WHERE bs."storeId" = v."storeId" AND bs."gstScheme" = 'REGULAR_B2B';
