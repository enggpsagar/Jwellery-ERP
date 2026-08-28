-- Subscription ledger. Store.planStartedAt/planExpiresAt are overwritten on
-- every assignment, so without this a renewal destroys the period it
-- replaced and "history" cannot be answered.
CREATE TYPE "StorePlanAction" AS ENUM ('REGISTERED', 'ASSIGNED', 'RENEWED');

-- Reminder channel preferences. Email is delivered by the existing cron;
-- WhatsApp is a stored preference only — nothing sends on it yet.
ALTER TABLE "Store" ADD COLUMN "reminderEmailEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Store" ADD COLUMN "reminderWhatsappEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "StorePlanHistory" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "planId" TEXT,
    "planName" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "durationDays" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "action" "StorePlanAction" NOT NULL DEFAULT 'ASSIGNED',
    "actorId" TEXT,
    "actorName" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorePlanHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StorePlanHistory_storeId_idx" ON "StorePlanHistory"("storeId");
CREATE INDEX "StorePlanHistory_startedAt_idx" ON "StorePlanHistory"("startedAt");

ALTER TABLE "StorePlanHistory" ADD CONSTRAINT "StorePlanHistory_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StorePlanHistory" ADD CONSTRAINT "StorePlanHistory_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every store already carrying a plan gets its current period as
-- the opening row, so the ledger is not blank for stores that predate it.
-- Recorded as ASSIGNED because there is no way to tell now whether the
-- current period was the first one or a renewal.
INSERT INTO "StorePlanHistory" ("id", "storeId", "planId", "planName", "price", "durationDays", "startedAt", "expiresAt", "action", "note", "createdAt")
SELECT
    gen_random_uuid()::text,
    s."id",
    s."planId",
    COALESCE(p."name", 'Unknown plan'),
    COALESCE(p."price", 0),
    COALESCE(p."durationDays", 0),
    COALESCE(s."planStartedAt", s."createdAt"),
    s."planExpiresAt",
    'ASSIGNED',
    'Opening balance — recorded when the subscription ledger was introduced',
    CURRENT_TIMESTAMP
FROM "Store" s
LEFT JOIN "Plan" p ON p."id" = s."planId"
WHERE s."planId" IS NOT NULL AND s."planExpiresAt" IS NOT NULL;
