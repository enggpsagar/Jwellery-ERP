-- Throttles the "your store is archived" email: without it every blocked
-- sign-in attempt would send the owner another copy.
-- Nullable, so no backfill is needed.
ALTER TABLE "Store" ADD COLUMN "archiveNotifiedAt" TIMESTAMP(3);
