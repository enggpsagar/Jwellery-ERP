-- Pre-fill Styles and Stone Clarities for every existing store that has
-- none (lib/inventory/starter-masters.ts — keep the lists in step). New
-- stores are seeded at creation instead.
INSERT INTO "StoreStyle" ("id", "storeId", "name", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, s."id", v.name, true, now(), now()
FROM "Store" s
CROSS JOIN (VALUES ('Ladies'), ('Gents'), ('Kids'), ('Unisex')) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM "StoreStyle" x WHERE x."storeId" = s."id");

INSERT INTO "StoreStoneClarity" ("id", "storeId", "name", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, s."id", v.name, true, now(), now()
FROM "Store" s
CROSS JOIN (VALUES ('EF/VVS'), ('EF/VVS-VS'), ('FG/VVS-VS'), ('GH/VS'), ('GH/VS-SI'), ('HI/SI'), ('IJ/SI')) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM "StoreStoneClarity" x WHERE x."storeId" = s."id");
