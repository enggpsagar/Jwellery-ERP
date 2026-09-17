-- Merge the standalone Vendor table into Customer as one unified "Party"
-- table. Every existing Vendor row is folded into a Customer row (reusing
-- the Customer already linked via linkedVendorId when one exists, merging
-- into a phone-matching Customer when the vendor happens to share a phone
-- number with one, otherwise inserted as a brand-new Customer row that
-- reuses the Vendor's own id so every existing FK column pointing at it
-- needs no rewrite at all). Purchase.vendorId / InventoryStock.vendorId /
-- LedgerEntry.vendorId then get repointed to reference Customer instead of
-- Vendor. The Vendor table itself is deliberately left in place, unused,
-- as a one-release rollback safety net (see its schema.prisma doc comment)
-- — it is dropped in a later, separate migration once this is verified
-- stable in production.

-- 1. New columns on Customer to receive what Vendor carried.
ALTER TABLE "Customer" ADD COLUMN "vendorCode" TEXT;
ALTER TABLE "Customer" ADD COLUMN "isVendor" BOOLEAN NOT NULL DEFAULT false;

-- 1b. Drop the OLD vendorId FK constraints (pointing at Vendor) BEFORE
--     rewriting any vendorId value below — otherwise the very first UPDATE
--     that repoints a vendorId to a Customer-only id trips the still-active
--     old constraint (Customer ids are, almost by definition, not present
--     in Vendor). The new constraints (pointing at Customer) are added back
--     at the very end, once every vendorId value is guaranteed valid.
ALTER TABLE "Purchase" DROP CONSTRAINT IF EXISTS "Purchase_vendorId_fkey";
ALTER TABLE "InventoryStock" DROP CONSTRAINT IF EXISTS "InventoryStock_vendorId_fkey";
ALTER TABLE "LedgerEntry" DROP CONSTRAINT IF EXISTS "LedgerEntry_vendorId_fkey";

-- 2. Vendors already linked to a Customer via linkedVendorId: merge fields
--    onto that Customer (never overwriting a non-null/non-zero value).
UPDATE "Customer" c
SET
  "vendorCode" = COALESCE(c."vendorCode", v."vendorCode"),
  "isVendor" = true,
  "gstin" = COALESCE(c."gstin", v."gstin"),
  "aadhaarNumber" = COALESCE(c."aadhaarNumber", v."aadhaarNumber"),
  "notes" = COALESCE(c."notes", v."notes"),
  "openingBalance" = CASE WHEN c."openingBalance" = 0 THEN v."openingBalance" ELSE c."openingBalance" END,
  "gstType" = CASE WHEN c."gstType" = 'UNREGISTERED' THEN v."gstType" ELSE c."gstType" END
FROM "Vendor" v
WHERE c."linkedVendorId" = v."id";

UPDATE "Purchase" p SET "vendorId" = c."id"
FROM "Customer" c WHERE c."linkedVendorId" = p."vendorId";

UPDATE "InventoryStock" s SET "vendorId" = c."id"
FROM "Customer" c WHERE c."linkedVendorId" = s."vendorId";

UPDATE "LedgerEntry" l SET "vendorId" = c."id"
FROM "Customer" c WHERE c."linkedVendorId" = l."vendorId";

-- 3. Vendors with no explicit link, but whose phone happens to match a
--    *different* existing Customer in the same store: treat as the same
--    real-world party (Customer.phone is store-unique, so this is the only
--    safe resolution — a second Customer row with that phone can't exist
--    anyway). DISTINCT ON picks one match deterministically if, in a rare
--    case, more than one unlinked vendor shares that same phone.
WITH phone_matches AS (
  SELECT DISTINCT ON (v.id) v.id AS vendor_id, c.id AS customer_id
  FROM "Vendor" v
  JOIN "Customer" c ON c."storeId" = v."storeId" AND c.phone = v.phone AND v.phone IS NOT NULL
  WHERE NOT EXISTS (SELECT 1 FROM "Customer" c2 WHERE c2."linkedVendorId" = v.id)
  ORDER BY v.id, c.id
)
UPDATE "Customer" c
SET
  "vendorCode" = COALESCE(c."vendorCode", v."vendorCode"),
  "isVendor" = true,
  "gstin" = COALESCE(c."gstin", v."gstin"),
  "aadhaarNumber" = COALESCE(c."aadhaarNumber", v."aadhaarNumber"),
  "notes" = COALESCE(c."notes", v."notes"),
  "openingBalance" = CASE WHEN c."openingBalance" = 0 THEN v."openingBalance" ELSE c."openingBalance" END,
  "gstType" = CASE WHEN c."gstType" = 'UNREGISTERED' THEN v."gstType" ELSE c."gstType" END
FROM phone_matches pm
JOIN "Vendor" v ON v.id = pm.vendor_id
WHERE c.id = pm.customer_id;

WITH phone_matches AS (
  SELECT DISTINCT ON (v.id) v.id AS vendor_id, c.id AS customer_id
  FROM "Vendor" v
  JOIN "Customer" c ON c."storeId" = v."storeId" AND c.phone = v.phone AND v.phone IS NOT NULL
  WHERE NOT EXISTS (SELECT 1 FROM "Customer" c2 WHERE c2."linkedVendorId" = v.id)
  ORDER BY v.id, c.id
)
UPDATE "Purchase" p SET "vendorId" = pm.customer_id
FROM phone_matches pm WHERE p."vendorId" = pm.vendor_id;

WITH phone_matches AS (
  SELECT DISTINCT ON (v.id) v.id AS vendor_id, c.id AS customer_id
  FROM "Vendor" v
  JOIN "Customer" c ON c."storeId" = v."storeId" AND c.phone = v.phone AND v.phone IS NOT NULL
  WHERE NOT EXISTS (SELECT 1 FROM "Customer" c2 WHERE c2."linkedVendorId" = v.id)
  ORDER BY v.id, c.id
)
UPDATE "InventoryStock" s SET "vendorId" = pm.customer_id
FROM phone_matches pm WHERE s."vendorId" = pm.vendor_id;

WITH phone_matches AS (
  SELECT DISTINCT ON (v.id) v.id AS vendor_id, c.id AS customer_id
  FROM "Vendor" v
  JOIN "Customer" c ON c."storeId" = v."storeId" AND c.phone = v.phone AND v.phone IS NOT NULL
  WHERE NOT EXISTS (SELECT 1 FROM "Customer" c2 WHERE c2."linkedVendorId" = v.id)
  ORDER BY v.id, c.id
)
UPDATE "LedgerEntry" l SET "vendorId" = pm.customer_id
FROM phone_matches pm WHERE l."vendorId" = pm.vendor_id;

-- 4. Every remaining vendor (no link, no collision with an existing
--    Customer's phone): insert as a new Customer row. Two (or more) of
--    these remaining vendors can still share a phone number WITH EACH
--    OTHER (Vendor.phone was never unique, only indexed) — inserting both
--    independently would trip Customer's own @@unique([storeId, phone]).
--    Resolved the same way as step 3: treat same-phone remaining vendors
--    as one real party, picking the lowest id in each (storeId, phone)
--    group as the row that actually gets inserted (reusing its own id, so
--    its own FK columns need no rewrite), and redirecting every other
--    vendor in that group's FK columns to the representative's id instead.
--    A null phone never groups with anything (CASE below always
--    self-represents), matching how a unique index treats NULLs.
WITH remaining_vendors AS (
  SELECT v.*
  FROM "Vendor" v
  WHERE NOT EXISTS (SELECT 1 FROM "Customer" c WHERE c."linkedVendorId" = v."id")
    AND NOT EXISTS (
      SELECT 1 FROM "Customer" c2 WHERE c2."storeId" = v."storeId" AND c2."phone" = v."phone" AND v."phone" IS NOT NULL
    )
),
dedup AS (
  SELECT
    "id" AS vendor_id,
    CASE
      WHEN "phone" IS NULL THEN "id"
      ELSE MIN("id") OVER (PARTITION BY "storeId", "phone")
    END AS representative_id
  FROM remaining_vendors
)
INSERT INTO "Customer" (
  "id", "storeId", "customerCode", "vendorCode", "name", "phone", "alternatePhone", "email",
  "addressLine1", "addressLine2", "city", "state", "pincode", "gstin", "gstType", "panNumber",
  "aadhaarNumber", "registrationId", "notes", "openingBalance", "isActive", "createdAt",
  "updatedAt", "isArchived", "createdById", "createdByName", "isVendor"
)
SELECT
  v."id", v."storeId", NULL, v."vendorCode", v."name", v."phone", v."alternatePhone", v."email",
  v."addressLine1", v."addressLine2", v."city", v."state", v."pincode", v."gstin", v."gstType", NULL,
  v."aadhaarNumber", NULL, v."notes", v."openingBalance", v."isActive", v."createdAt",
  v."updatedAt", v."isArchived", NULL, NULL, true
FROM "Vendor" v
JOIN dedup d ON d.vendor_id = v."id" AND d.representative_id = v."id";

-- 4b. Redirect the non-representative duplicates' FK columns to whichever
--     representative row from the same group actually got inserted above.
WITH remaining_vendors AS (
  SELECT v.*
  FROM "Vendor" v
  WHERE NOT EXISTS (SELECT 1 FROM "Customer" c WHERE c."linkedVendorId" = v."id")
    AND NOT EXISTS (
      SELECT 1 FROM "Customer" c2 WHERE c2."storeId" = v."storeId" AND c2."phone" = v."phone" AND v."phone" IS NOT NULL
    )
),
dedup AS (
  SELECT
    "id" AS vendor_id,
    CASE
      WHEN "phone" IS NULL THEN "id"
      ELSE MIN("id") OVER (PARTITION BY "storeId", "phone")
    END AS representative_id
  FROM remaining_vendors
)
UPDATE "Purchase" p SET "vendorId" = d.representative_id
FROM dedup d WHERE p."vendorId" = d.vendor_id AND d.vendor_id <> d.representative_id;

WITH remaining_vendors AS (
  SELECT v.*
  FROM "Vendor" v
  WHERE NOT EXISTS (SELECT 1 FROM "Customer" c WHERE c."linkedVendorId" = v."id")
    AND NOT EXISTS (
      SELECT 1 FROM "Customer" c2 WHERE c2."storeId" = v."storeId" AND c2."phone" = v."phone" AND v."phone" IS NOT NULL
    )
),
dedup AS (
  SELECT
    "id" AS vendor_id,
    CASE
      WHEN "phone" IS NULL THEN "id"
      ELSE MIN("id") OVER (PARTITION BY "storeId", "phone")
    END AS representative_id
  FROM remaining_vendors
)
UPDATE "InventoryStock" s SET "vendorId" = d.representative_id
FROM dedup d WHERE s."vendorId" = d.vendor_id AND d.vendor_id <> d.representative_id;

WITH remaining_vendors AS (
  SELECT v.*
  FROM "Vendor" v
  WHERE NOT EXISTS (SELECT 1 FROM "Customer" c WHERE c."linkedVendorId" = v."id")
    AND NOT EXISTS (
      SELECT 1 FROM "Customer" c2 WHERE c2."storeId" = v."storeId" AND c2."phone" = v."phone" AND v."phone" IS NOT NULL
    )
),
dedup AS (
  SELECT
    "id" AS vendor_id,
    CASE
      WHEN "phone" IS NULL THEN "id"
      ELSE MIN("id") OVER (PARTITION BY "storeId", "phone")
    END AS representative_id
  FROM remaining_vendors
)
UPDATE "LedgerEntry" l SET "vendorId" = d.representative_id
FROM dedup d WHERE l."vendorId" = d.vendor_id AND d.vendor_id <> d.representative_id;

-- 5. Drop the now-obsolete Customer<->Vendor link column.
ALTER TABLE "Customer" DROP CONSTRAINT IF EXISTS "Customer_linkedVendorId_fkey";
DROP INDEX IF EXISTS "Customer_linkedVendorId_key";
ALTER TABLE "Customer" DROP COLUMN IF EXISTS "linkedVendorId";

-- 6. Add the NEW vendorId FK constraints, now pointing at Customer instead
--    of Vendor (same ON DELETE/ON UPDATE behavior as before) — added only
--    now that every vendorId value above is guaranteed to resolve to a
--    real Customer row.
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryStock" ADD CONSTRAINT "InventoryStock_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. New unique index for the transplanted vendorCode (added last, so it
--    validates against the fully-merged final state).
CREATE UNIQUE INDEX "Customer_storeId_vendorCode_key" ON "Customer"("storeId", "vendorCode");
