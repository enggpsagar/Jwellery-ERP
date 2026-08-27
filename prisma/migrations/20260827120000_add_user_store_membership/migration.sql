-- Per-store access for a user. One login (User stays globally unique on
-- email/phone, which authentication depends on), one row here per store.
CREATE TABLE "UserStoreMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STAFF',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserStoreMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserStoreMembership_userId_storeId_key" ON "UserStoreMembership"("userId", "storeId");
CREATE INDEX "UserStoreMembership_userId_idx" ON "UserStoreMembership"("userId");
CREATE INDEX "UserStoreMembership_storeId_idx" ON "UserStoreMembership"("storeId");

ALTER TABLE "UserStoreMembership" ADD CONSTRAINT "UserStoreMembership_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserStoreMembership" ADD CONSTRAINT "UserStoreMembership_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every user already attached to a store gets an equivalent
-- membership, so nobody loses access the moment reads start preferring this
-- table. Super Admins have no store and correctly get no membership.
INSERT INTO "UserStoreMembership" ("id", "userId", "storeId", "role", "permissions", "isActive", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    u."id",
    u."storeId",
    u."role",
    COALESCE(u."permissions", ARRAY[]::TEXT[]),
    u."isActive",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User" u
WHERE u."storeId" IS NOT NULL
ON CONFLICT ("userId", "storeId") DO NOTHING;
