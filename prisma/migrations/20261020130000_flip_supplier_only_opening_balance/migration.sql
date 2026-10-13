-- One net balance per party (2026-10-13): Customer.openingBalance is now
-- SIGNED — positive = Receivable (the party owes the store), negative =
-- Payable (the store owes the party). Before this, the party form only took
-- a positive number, and a party that came over from the old Vendor table
-- (20260917150000_merge_vendor_into_customer) carried its supplier opening
-- balance — money the store OWED that supplier — as a positive figure,
-- which the new net balance would read as Receivable.
--
-- This negates openingBalance for parties that:
--   * originated as a Vendor — vendorCode IS NOT NULL. Only the merge
--     migration ever set vendorCode (no code path assigns one), for every
--     Vendor row it folded in, whether inserted as a new party or merged
--     onto an existing customer;
--   * still carry that Vendor's own opening balance — the merge kept a
--     customer's own non-zero opening balance over the vendor's, so a
--     positive figure is only known to be a supplier balance when it still
--     equals the source Vendor row's (Vendor is still in the DB as the
--     merge's rollback copy; storeId + vendorCode is unique there). A
--     figure edited since is left alone — see the review query in the
--     report / below;
--   * have never been on a sale: no Invoice, Kacha slip, Quotation or
--     Draft Order, and no SALE ledger entry;
--   * have openingBalance > 0.
--
-- Data-only, no schema change. Runs once (Prisma records it); re-running
-- it by hand is also a no-op, since a flipped row is negative and no longer
-- equals its positive Vendor figure.
UPDATE "Customer" c
SET "openingBalance" = -c."openingBalance",
    "updatedAt" = NOW()
WHERE c."vendorCode" IS NOT NULL
  AND c."openingBalance" > 0
  AND EXISTS (
    SELECT 1 FROM "Vendor" v
    WHERE v."storeId" = c."storeId"
      AND v."vendorCode" = c."vendorCode"
      AND v."openingBalance" = c."openingBalance"
  )
  AND NOT EXISTS (SELECT 1 FROM "Invoice" i WHERE i."customerId" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "KachaInvoice" k WHERE k."customerId" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "Quotation" q WHERE q."customerId" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "DraftOrder" d WHERE d."customerId" = c."id")
  AND NOT EXISTS (
    SELECT 1 FROM "LedgerEntry" l
    WHERE l."customerId" = c."id" AND l."sourceType" = 'SALE'
  );
