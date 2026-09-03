-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "hallmarkChargePerPiece" DECIMAL(12,2) NOT NULL DEFAULT 45;

-- AlterTable
ALTER TABLE "KachaInvoiceItem" ADD COLUMN     "hmCharge" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "QuotationItem" ADD COLUMN     "hmCharge" DECIMAL(12,2) NOT NULL DEFAULT 0;
