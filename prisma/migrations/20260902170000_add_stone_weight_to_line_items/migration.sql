-- AlterTable
ALTER TABLE "KachaInvoiceItem" ADD COLUMN     "stoneWeight" DECIMAL(12,5);

-- AlterTable
ALTER TABLE "PurchaseItem" ADD COLUMN     "stoneWeight" DECIMAL(12,5);

-- AlterTable
ALTER TABLE "QuotationItem" ADD COLUMN     "stoneWeight" DECIMAL(12,5);
