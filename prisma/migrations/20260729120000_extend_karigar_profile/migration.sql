-- Extend Karigar with a fuller profile (code, contact, KYC, split opening balances)

-- 1. Add new columns (nullable / defaulted so existing rows don't break)
ALTER TABLE "Karigar" ADD COLUMN "code" TEXT;
ALTER TABLE "Karigar" ADD COLUMN "mobile" TEXT;
ALTER TABLE "Karigar" ADD COLUMN "whatsapp" TEXT;
ALTER TABLE "Karigar" ADD COLUMN "email" TEXT;
ALTER TABLE "Karigar" ADD COLUMN "pincode" TEXT;
ALTER TABLE "Karigar" ADD COLUMN "gstNumber" TEXT;
ALTER TABLE "Karigar" ADD COLUMN "panNumber" TEXT;
ALTER TABLE "Karigar" ADD COLUMN "aadhaarNumber" TEXT;
ALTER TABLE "Karigar" ADD COLUMN "openingGold" DECIMAL(10,3) NOT NULL DEFAULT 0;
ALTER TABLE "Karigar" ADD COLUMN "openingCash" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- 2. Migrate existing data: phone -> mobile, openingBalance -> openingCash
UPDATE "Karigar" SET "mobile" = "phone" WHERE "phone" IS NOT NULL;
UPDATE "Karigar" SET "openingCash" = "openingBalance";

-- 3. Drop the old columns now that data has been carried over
ALTER TABLE "Karigar" DROP COLUMN "phone";
ALTER TABLE "Karigar" DROP COLUMN "openingBalance";

-- 4. Unique index + lookup indexes to match the new schema
CREATE UNIQUE INDEX "Karigar_code_key" ON "Karigar"("code");
CREATE INDEX "Karigar_mobile_idx" ON "Karigar"("mobile");
CREATE INDEX "Karigar_code_idx" ON "Karigar"("code");

-- NOTE: run `npx prisma generate` after applying this migration so the
-- Prisma Client types match the new columns.
