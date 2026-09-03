-- CreateEnum
CREATE TYPE "PartyGstType" AS ENUM ('UNREGISTERED', 'REGULAR', 'COMPOSITION');

-- AlterTable: add the new column first, alongside the old one, so we can
-- backfill from it before it's dropped.
ALTER TABLE "Customer" ADD COLUMN     "gstType" "PartyGstType" NOT NULL DEFAULT 'UNREGISTERED';
ALTER TABLE "Vendor" ADD COLUMN     "gstType" "PartyGstType" NOT NULL DEFAULT 'UNREGISTERED';

-- Backfill: preserve the previous isGstRegistered=true meaning (GSTIN
-- required/shown) as the closest equivalent, REGULAR - there is no signal
-- in the old boolean to distinguish REGULAR from COMPOSITION, and defaulting
-- to REGULAR is the safer guess (it keeps GSTIN required, same as before,
-- rather than silently relaxing it).
UPDATE "Customer" SET "gstType" = 'REGULAR' WHERE "isGstRegistered" = true;
UPDATE "Vendor" SET "gstType" = 'REGULAR' WHERE "isGstRegistered" = true;

-- AlterTable: drop the now-superseded boolean.
ALTER TABLE "Customer" DROP COLUMN "isGstRegistered";
ALTER TABLE "Vendor" DROP COLUMN "isGstRegistered";
