-- Dynamic Business Units
--
-- BusinessSettings.businessUnits moves from a fixed `BusinessUnit` enum
-- array (MONEY | GOLD | SILVER | DIAMOND) to a plain String[]. Each entry is
-- now either the literal sentinel "MONEY" (always offered, not a real row
-- anywhere) or a live StoreMetal.id — covering both plain metals and
-- gemstones (StoreMetal.isGemstone), since a store's actual settlement
-- units are whatever it has configured in Taxonomy, not a fixed list. See
-- lib/business-units.server.ts for the read-side helpers that resolve this
-- column going forward.
--
-- Note: `prisma migrate diff` against the live DB also reported an
-- unrelated DropForeignKey ("CaratConversionRate_storeId_fkey") and
-- DropTable ("CaratConversionRate") — pre-existing schema drift from other
-- concurrent work already removed from schema.prisma but never migrated.
-- Deliberately NOT included in this migration; out of scope here.

-- Step 1: widen the column to text[]. The USING clause casts each existing
-- enum value to its text name (e.g. GOLD -> 'GOLD'), so no data is lost yet.
ALTER TABLE "BusinessSettings" ALTER COLUMN "businessUnits" DROP DEFAULT;
ALTER TABLE "BusinessSettings"
  ALTER COLUMN "businessUnits" TYPE TEXT[] USING "businessUnits"::text[];
ALTER TABLE "BusinessSettings"
  ALTER COLUMN "businessUnits" SET DEFAULT ARRAY['MONEY']::TEXT[];

-- Step 2: best-effort backfill. For each store, replace each legacy
-- GOLD/SILVER/DIAMOND value with the id of a StoreMetal row belonging to
-- that store whose name case-insensitively contains "gold"/"silver"/
-- "diamond" respectively (same substring convention as classifyMetalName in
-- lib/business-units.ts). "MONEY" is kept as a literal string as-is. A
-- legacy value with no matching StoreMetal is simply dropped rather than
-- failing the migration — this is a best-effort remap of a *live config*
-- selection, not a rewrite of historical transactions. A store left with
-- nothing after this falls back to ["MONEY"], never an empty array.
DO $$
DECLARE
  settings_row RECORD;
  legacy_value TEXT;
  matched_metal_id TEXT;
  new_units TEXT[];
BEGIN
  FOR settings_row IN SELECT "storeId", "businessUnits" FROM "BusinessSettings" LOOP
    new_units := ARRAY[]::TEXT[];

    FOREACH legacy_value IN ARRAY settings_row."businessUnits" LOOP
      IF legacy_value = 'MONEY' THEN
        new_units := array_append(new_units, 'MONEY');
      ELSIF legacy_value IN ('GOLD', 'SILVER', 'DIAMOND') THEN
        matched_metal_id := NULL;

        SELECT "id" INTO matched_metal_id
        FROM "StoreMetal"
        WHERE "storeId" = settings_row."storeId"
          AND "name" ILIKE ('%' || lower(legacy_value) || '%')
        ORDER BY "createdAt" ASC, "id" ASC
        LIMIT 1;

        IF matched_metal_id IS NOT NULL THEN
          new_units := array_append(new_units, matched_metal_id);
        END IF;
      END IF;
      -- Any other unrecognized legacy value is dropped silently.
    END LOOP;

    IF array_length(new_units, 1) IS NULL THEN
      new_units := ARRAY['MONEY'];
    END IF;

    UPDATE "BusinessSettings"
    SET "businessUnits" = new_units
    WHERE "storeId" = settings_row."storeId";
  END LOOP;
END $$;

-- Step 3: the enum is no longer referenced by any column — drop it.
DROP TYPE "BusinessUnit";
