-- AlterTable
ALTER TABLE "InventoryStock" ADD COLUMN     "caratWeight" DECIMAL(10,3);

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "caratWeight" DECIMAL(10,3);

-- AlterTable
ALTER TABLE "KachaInvoiceItem" ADD COLUMN     "caratWeight" DECIMAL(10,3);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "defaultCaratWeight" DECIMAL(10,3);

-- AlterTable
ALTER TABLE "PurchaseItem" ADD COLUMN     "caratWeight" DECIMAL(10,3);

-- AlterTable
ALTER TABLE "QuotationItem" ADD COLUMN     "caratWeight" DECIMAL(10,3);
