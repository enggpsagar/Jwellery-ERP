-- Pure-metal (24K / 999) equivalent of every stored metal weight — see
-- lib/fine-weight.ts for the rule (kept identical here):
--   hasPurity metal -> netWeight x fineness / 100, fineness = the metal's own
--   purity row (StoreMetalPurity on metal + purityLabel) -> else the store's
--   PurityFineness for the legacy enum -> else the enum's default -> else 100;
--   any other metal (or no metal) -> netWeight itself.
-- The UPDATE statements below are also re-run by
-- scripts/backfill-fine-weights.ts for freshly seeded databases.

-- AlterTable
ALTER TABLE "InventoryStock" ADD COLUMN "fineWeight" DECIMAL(12,5);

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN "fineWeight" DECIMAL(12,5);

-- AlterTable
ALTER TABLE "PurchaseItem" ADD COLUMN "fineWeight" DECIMAL(12,5);

-- AlterTable
ALTER TABLE "KachaInvoiceItem" ADD COLUMN "fineWeight" DECIMAL(12,5);

-- AlterTable
ALTER TABLE "QuotationItem" ADD COLUMN "fineWeight" DECIMAL(12,5);

-- Backfill InventoryStock
UPDATE "InventoryStock" AS t SET "fineWeight" = s.fine
FROM (
  SELECT x."id",
    CASE
      WHEN sm."hasPurity" IS TRUE THEN ROUND(x."netWeight" * COALESCE(
        smp."finenessPercent",
        pf."finenessPercent",
        CASE x."purity"::text
          WHEN 'GOLD_24K' THEN 100 WHEN 'GOLD_22K' THEN 91.6 WHEN 'GOLD_20K' THEN 83.3 WHEN 'GOLD_18K' THEN 75
          WHEN 'SILVER_999' THEN 99.9 WHEN 'SILVER_925' THEN 92.5
          WHEN 'PLATINUM_950' THEN 95 WHEN 'PLATINUM_900' THEN 90
        END,
        100) / 100, 5)
      ELSE x."netWeight"
    END AS fine
  FROM "InventoryStock" AS x
  LEFT JOIN "StoreMetal" AS sm ON sm."id" = x."metalTypeId"
  LEFT JOIN "StoreMetalPurity" AS smp ON smp."storeMetalId" = x."metalTypeId" AND smp."label" = x."purityLabel"
  LEFT JOIN "PurityFineness" AS pf ON pf."storeId" = sm."storeId" AND pf."purity" = x."purity"
  WHERE x."netWeight" IS NOT NULL AND x."fineWeight" IS NULL
) AS s
WHERE t."id" = s."id";

-- Backfill InvoiceItem
UPDATE "InvoiceItem" AS t SET "fineWeight" = s.fine
FROM (
  SELECT x."id",
    CASE
      WHEN sm."hasPurity" IS TRUE THEN ROUND(x."netWeight" * COALESCE(
        smp."finenessPercent",
        pf."finenessPercent",
        CASE x."purity"::text
          WHEN 'GOLD_24K' THEN 100 WHEN 'GOLD_22K' THEN 91.6 WHEN 'GOLD_20K' THEN 83.3 WHEN 'GOLD_18K' THEN 75
          WHEN 'SILVER_999' THEN 99.9 WHEN 'SILVER_925' THEN 92.5
          WHEN 'PLATINUM_950' THEN 95 WHEN 'PLATINUM_900' THEN 90
        END,
        100) / 100, 5)
      ELSE x."netWeight"
    END AS fine
  FROM "InvoiceItem" AS x
  LEFT JOIN "StoreMetal" AS sm ON sm."id" = x."metalTypeId"
  LEFT JOIN "StoreMetalPurity" AS smp ON smp."storeMetalId" = x."metalTypeId" AND smp."label" = x."purityLabel"
  LEFT JOIN "PurityFineness" AS pf ON pf."storeId" = sm."storeId" AND pf."purity" = x."purity"
  WHERE x."netWeight" IS NOT NULL AND x."fineWeight" IS NULL
) AS s
WHERE t."id" = s."id";

-- Backfill PurchaseItem
UPDATE "PurchaseItem" AS t SET "fineWeight" = s.fine
FROM (
  SELECT x."id",
    CASE
      WHEN sm."hasPurity" IS TRUE THEN ROUND(x."netWeight" * COALESCE(
        smp."finenessPercent",
        pf."finenessPercent",
        CASE x."purity"::text
          WHEN 'GOLD_24K' THEN 100 WHEN 'GOLD_22K' THEN 91.6 WHEN 'GOLD_20K' THEN 83.3 WHEN 'GOLD_18K' THEN 75
          WHEN 'SILVER_999' THEN 99.9 WHEN 'SILVER_925' THEN 92.5
          WHEN 'PLATINUM_950' THEN 95 WHEN 'PLATINUM_900' THEN 90
        END,
        100) / 100, 5)
      ELSE x."netWeight"
    END AS fine
  FROM "PurchaseItem" AS x
  LEFT JOIN "StoreMetal" AS sm ON sm."id" = x."metalTypeId"
  LEFT JOIN "StoreMetalPurity" AS smp ON smp."storeMetalId" = x."metalTypeId" AND smp."label" = x."purityLabel"
  LEFT JOIN "PurityFineness" AS pf ON pf."storeId" = sm."storeId" AND pf."purity" = x."purity"
  WHERE x."netWeight" IS NOT NULL AND x."fineWeight" IS NULL
) AS s
WHERE t."id" = s."id";

-- Backfill KachaInvoiceItem
UPDATE "KachaInvoiceItem" AS t SET "fineWeight" = s.fine
FROM (
  SELECT x."id",
    CASE
      WHEN sm."hasPurity" IS TRUE THEN ROUND(x."netWeight" * COALESCE(
        smp."finenessPercent",
        pf."finenessPercent",
        CASE x."purity"::text
          WHEN 'GOLD_24K' THEN 100 WHEN 'GOLD_22K' THEN 91.6 WHEN 'GOLD_20K' THEN 83.3 WHEN 'GOLD_18K' THEN 75
          WHEN 'SILVER_999' THEN 99.9 WHEN 'SILVER_925' THEN 92.5
          WHEN 'PLATINUM_950' THEN 95 WHEN 'PLATINUM_900' THEN 90
        END,
        100) / 100, 5)
      ELSE x."netWeight"
    END AS fine
  FROM "KachaInvoiceItem" AS x
  LEFT JOIN "StoreMetal" AS sm ON sm."id" = x."metalTypeId"
  LEFT JOIN "StoreMetalPurity" AS smp ON smp."storeMetalId" = x."metalTypeId" AND smp."label" = x."purityLabel"
  LEFT JOIN "PurityFineness" AS pf ON pf."storeId" = sm."storeId" AND pf."purity" = x."purity"
  WHERE x."netWeight" IS NOT NULL AND x."fineWeight" IS NULL
) AS s
WHERE t."id" = s."id";

-- Backfill QuotationItem
UPDATE "QuotationItem" AS t SET "fineWeight" = s.fine
FROM (
  SELECT x."id",
    CASE
      WHEN sm."hasPurity" IS TRUE THEN ROUND(x."netWeight" * COALESCE(
        smp."finenessPercent",
        pf."finenessPercent",
        CASE x."purity"::text
          WHEN 'GOLD_24K' THEN 100 WHEN 'GOLD_22K' THEN 91.6 WHEN 'GOLD_20K' THEN 83.3 WHEN 'GOLD_18K' THEN 75
          WHEN 'SILVER_999' THEN 99.9 WHEN 'SILVER_925' THEN 92.5
          WHEN 'PLATINUM_950' THEN 95 WHEN 'PLATINUM_900' THEN 90
        END,
        100) / 100, 5)
      ELSE x."netWeight"
    END AS fine
  FROM "QuotationItem" AS x
  LEFT JOIN "StoreMetal" AS sm ON sm."id" = x."metalTypeId"
  LEFT JOIN "StoreMetalPurity" AS smp ON smp."storeMetalId" = x."metalTypeId" AND smp."label" = x."purityLabel"
  LEFT JOIN "PurityFineness" AS pf ON pf."storeId" = sm."storeId" AND pf."purity" = x."purity"
  WHERE x."netWeight" IS NOT NULL AND x."fineWeight" IS NULL
) AS s
WHERE t."id" = s."id";
