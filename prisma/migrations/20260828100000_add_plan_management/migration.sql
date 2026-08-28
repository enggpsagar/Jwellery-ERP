-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "planExpiresAt" TIMESTAMP(3),
ADD COLUMN     "planId" TEXT,
ADD COLUMN     "planReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "planStartedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the starter plan catalog
INSERT INTO "Plan" ("id", "name", "durationDays", "price", "isActive", "sortOrder", "updatedAt") VALUES
  ('plan-30-trial', '30 Days – Free Trial', 30, 0, true, 1, CURRENT_TIMESTAMP),
  ('plan-90', '90 Days', 90, 499, true, 2, CURRENT_TIMESTAMP),
  ('plan-180', '180 Days', 180, 999, true, 3, CURRENT_TIMESTAMP),
  ('plan-365', '365 Days', 365, 1499, true, 4, CURRENT_TIMESTAMP);
