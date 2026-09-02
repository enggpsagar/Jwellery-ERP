-- AlterTable
ALTER TABLE "InventoryStock" ADD COLUMN     "stoneRate" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "stoneRate" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "KachaInvoiceItem" ADD COLUMN     "stoneRate" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "defaultStoneRate" DECIMAL(12,2),
ADD COLUMN     "hasStoneComponent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PurchaseItem" ADD COLUMN     "stoneRate" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "QuotationItem" ADD COLUMN     "stoneRate" DECIMAL(12,2);
