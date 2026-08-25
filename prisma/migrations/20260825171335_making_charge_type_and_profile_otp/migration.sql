-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OtpPurpose" ADD VALUE 'PROFILE_PHONE_CHANGE';
ALTER TYPE "OtpPurpose" ADD VALUE 'PROFILE_EMAIL_CHANGE';

-- AlterTable
ALTER TABLE "InventoryStock" ADD COLUMN     "makingChargeType" "ChargeType" NOT NULL DEFAULT 'FIXED';

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "makingChargeType" "ChargeType" NOT NULL DEFAULT 'FIXED';

-- AlterTable
ALTER TABLE "KachaInvoiceItem" ADD COLUMN     "makingChargeType" "ChargeType" NOT NULL DEFAULT 'FIXED';

-- AlterTable
ALTER TABLE "OtpCode" ADD COLUMN     "email" TEXT,
ALTER COLUMN "phone" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PurchaseItem" ADD COLUMN     "makingChargeType" "ChargeType" NOT NULL DEFAULT 'FIXED';

-- AlterTable
ALTER TABLE "QuotationItem" ADD COLUMN     "makingChargeType" "ChargeType" NOT NULL DEFAULT 'FIXED';

-- CreateIndex
CREATE INDEX "OtpCode_email_purpose_idx" ON "OtpCode"("email", "purpose");
