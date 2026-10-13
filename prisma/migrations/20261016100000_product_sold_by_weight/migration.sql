-- Sell by weight for bulk items (loose stones, bars, bullion, coins, raw metal).
-- Additive only: existing stock rows, quantities and weights are NOT changed.
-- A sold-by-weight product's existing rows with quantity > 1 keep selling by
-- the piece (lib/inventory/weight-lot.ts only treats a row as a lot when its
-- quantity is <= 1 and it has no PieceComponent rows); new purchases of such
-- a product come in as one lot per line.

ALTER TABLE "Product" ADD COLUMN "soldByWeight" BOOLEAN NOT NULL DEFAULT false;

-- Exact weights a sale line took off a sold-by-weight lot (null = by quantity).
ALTER TABLE "InvoiceItem" ADD COLUMN "lotDraw" JSONB;
ALTER TABLE "KachaInvoiceItem" ADD COLUMN "lotDraw" JSONB;

-- Stock movements of a sold-by-weight lot carry exactly what moved.
ALTER TABLE "InventoryTransaction" ADD COLUMN "caratWeight" DECIMAL(10,3);
ALTER TABLE "InventoryTransaction" ADD COLUMN "byWeight" BOOLEAN NOT NULL DEFAULT false;

-- Backfill (conservative):
-- 1. Loose stones: the product's own metal is a gemstone (StoreMetal.isGemstone)
--    and none of its metal rows is a non-gemstone metal; or it has no metal at
--    all, carries a stone, and has no metal rows (stone-only products minted
--    from a purchase/sale line).
UPDATE "Product" p
SET "soldByWeight" = true
WHERE (
    EXISTS (
      SELECT 1 FROM "StoreMetal" m
      WHERE m."id" = p."metalTypeId" AND m."isGemstone" = true
    )
    AND NOT EXISTS (
      SELECT 1 FROM "ProductMetalComponent" pmc
      JOIN "StoreMetal" m2 ON m2."id" = pmc."metalTypeId"
      WHERE pmc."productId" = p."id" AND m2."isGemstone" = false
    )
  )
  OR (
    p."metalTypeId" IS NULL
    AND p."hasStoneComponent" = true
    AND NOT EXISTS (
      SELECT 1 FROM "ProductMetalComponent" pmc WHERE pmc."productId" = p."id"
    )
  );

-- 2. Bulk metal: the category or category type name is a whole word
--    Bar(s) / Bullion / Biscuit(s) / Coin(s) / Raw (case-insensitive; \m \M are
--    Postgres word boundaries, so e.g. "Drawer" or "Barrette" don't match).
UPDATE "Product" p
SET "soldByWeight" = true
WHERE EXISTS (
    SELECT 1 FROM "StoreCategory" c
    WHERE c."id" = p."categoryId"
      AND c."name" ~* '\m(bars?|bullion|biscuits?|coins?|raw)\M'
  )
  OR EXISTS (
    SELECT 1 FROM "StoreCategoryType" t
    WHERE t."id" = p."categoryTypeId"
      AND t."name" ~* '\m(bars?|bullion|biscuits?|coins?|raw)\M'
  );
