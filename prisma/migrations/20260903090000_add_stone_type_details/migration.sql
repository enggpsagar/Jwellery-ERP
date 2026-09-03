-- AlterTable
ALTER TABLE "InventoryStock" ADD COLUMN     "stoneMetalTypeName" TEXT,
ADD COLUMN     "stoneTypeNames" TEXT;

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "stoneMetalTypeName" TEXT,
ADD COLUMN     "stoneTypeNames" TEXT;

-- AlterTable
ALTER TABLE "KachaInvoiceItem" ADD COLUMN     "stoneMetalTypeName" TEXT,
ADD COLUMN     "stoneTypeNames" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "defaultStoneMetalTypeName" TEXT,
ADD COLUMN     "defaultStoneTypeNames" TEXT;

-- AlterTable
ALTER TABLE "PurchaseItem" ADD COLUMN     "stoneMetalTypeName" TEXT,
ADD COLUMN     "stoneTypeNames" TEXT;

-- AlterTable
ALTER TABLE "QuotationItem" ADD COLUMN     "stoneMetalTypeName" TEXT,
ADD COLUMN     "stoneTypeNames" TEXT;
