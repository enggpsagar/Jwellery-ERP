-- Backfill KarigarMetal for every karigar that already existed before this
-- assignment feature shipped, so Issue/Receive Material doesn't suddenly
-- reject metals a karigar has genuinely already been working with. Sourced
-- from three places a metal could already be on record for a karigar: their
-- own single "mainly works with" metalTypeId, any KarigarJob they've been
-- issued material against, and any LedgerEntry recorded against them.
-- Karigars created after this migration start with an empty assignment list
-- and must be assigned explicitly.
INSERT INTO "KarigarMetal" ("id", "karigarId", "metalTypeId", "createdAt")
SELECT gen_random_uuid()::text, x."karigarId", x."metalTypeId", CURRENT_TIMESTAMP
FROM (
    SELECT "id" AS "karigarId", "metalTypeId"
    FROM "Karigar"
    WHERE "metalTypeId" IS NOT NULL

    UNION

    SELECT "karigarId", "metalTypeId"
    FROM "KarigarJob"
    WHERE "metalTypeId" IS NOT NULL

    UNION

    SELECT "karigarId", "metalTypeId"
    FROM "LedgerEntry"
    WHERE "karigarId" IS NOT NULL AND "metalTypeId" IS NOT NULL
) x
ON CONFLICT ("karigarId", "metalTypeId") DO NOTHING;
