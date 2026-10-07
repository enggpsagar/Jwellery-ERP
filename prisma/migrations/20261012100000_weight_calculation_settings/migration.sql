-- Settings > Weights: store-configurable net / fine weight calculation.
-- Additive only. Every default reproduces the behaviour before this
-- migration (net = gross − stone − DMO/less, fine = net × fineness %, no
-- wastage in fine, 3 decimals shown), so no existing row changes.

-- CreateEnum
CREATE TYPE "FineWeightBasis" AS ENUM ('NET', 'GROSS');

-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "addWastageToFineWeight" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fineWeightBasis" "FineWeightBasis" NOT NULL DEFAULT 'NET',
ADD COLUMN     "netDeductDmoWeight" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "netDeductStoneWeight" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "weightDecimalsCarat" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "weightDecimalsGram" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "weightRecalcJob" JSONB,
ADD COLUMN     "weightRecalcLog" JSONB;

-- Default wastage / touch % per purity (null = none).
ALTER TABLE "StoreMetalPurity" ADD COLUMN     "wastagePercent" DECIMAL(5,2);

-- Per-line wastage %, copied from the purity and editable on the line.
ALTER TABLE "InvoiceItem" ADD COLUMN     "wastagePercent" DECIMAL(5,2);
ALTER TABLE "KachaInvoiceItem" ADD COLUMN     "wastagePercent" DECIMAL(5,2);
ALTER TABLE "PieceComponent" ADD COLUMN     "wastagePercent" DECIMAL(5,2);
ALTER TABLE "PurchaseItem" ADD COLUMN     "wastagePercent" DECIMAL(5,2);
ALTER TABLE "QuotationItem" ADD COLUMN     "wastagePercent" DECIMAL(5,2);
