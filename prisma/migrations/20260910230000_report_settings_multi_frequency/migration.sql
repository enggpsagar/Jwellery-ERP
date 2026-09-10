-- AlterTable: add the new multi-select frequency array + per-frequency
-- last-sent columns, replacing the single `frequency` choice and single
-- `lastSentAt` gate.
ALTER TABLE "ReportSettings" ADD COLUMN "frequencies" "ReportFrequency"[] NOT NULL DEFAULT ARRAY[]::"ReportFrequency"[];
ALTER TABLE "ReportSettings" ADD COLUMN "dailyLastSentAt" TIMESTAMP(3);
ALTER TABLE "ReportSettings" ADD COLUMN "monthlyLastSentAt" TIMESTAMP(3);
ALTER TABLE "ReportSettings" ADD COLUMN "quarterlyLastSentAt" TIMESTAMP(3);
ALTER TABLE "ReportSettings" ADD COLUMN "annualLastSentAt" TIMESTAMP(3);

-- Backfill from the old single-value columns before dropping them, so an
-- existing store's choice and send history survive the shape change.
UPDATE "ReportSettings" SET "frequencies" = ARRAY["frequency"];
UPDATE "ReportSettings" SET "dailyLastSentAt" = "lastSentAt" WHERE "frequency" = 'DAILY';
UPDATE "ReportSettings" SET "monthlyLastSentAt" = "lastSentAt" WHERE "frequency" = 'MONTHLY';
UPDATE "ReportSettings" SET "quarterlyLastSentAt" = "lastSentAt" WHERE "frequency" = 'QUARTERLY';
UPDATE "ReportSettings" SET "annualLastSentAt" = "lastSentAt" WHERE "frequency" = 'ANNUAL';

-- AlterTable: drop the now-superseded single-value columns.
ALTER TABLE "ReportSettings" DROP COLUMN "frequency";
ALTER TABLE "ReportSettings" DROP COLUMN "lastSentAt";
