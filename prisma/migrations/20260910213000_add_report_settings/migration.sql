-- CreateEnum
CREATE TYPE "ReportFrequency" AS ENUM ('DAILY', 'MONTHLY', 'QUARTERLY', 'ANNUAL');

-- CreateTable
CREATE TABLE "ReportSettings" (
    "storeId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "frequency" "ReportFrequency" NOT NULL DEFAULT 'DAILY',
    "recipientEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportSettings_pkey" PRIMARY KEY ("storeId")
);

-- AddForeignKey
ALTER TABLE "ReportSettings" ADD CONSTRAINT "ReportSettings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
