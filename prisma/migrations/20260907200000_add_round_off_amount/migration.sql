-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "roundOffAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "KachaInvoice" ADD COLUMN     "roundOffAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "roundOffAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "roundOffAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
