-- DropIndex
DROP INDEX "InventoryStock_metalType_idx";

-- DropIndex
DROP INDEX "Product_category_idx";

-- DropIndex
DROP INDEX "Product_metalType_idx";

-- DropIndex
DROP INDEX "Product_ornamentType_idx";

-- AlterTable
ALTER TABLE "InventoryStock" DROP COLUMN "metalType";

-- AlterTable
ALTER TABLE "InvoiceItem" DROP COLUMN "metalType";

-- AlterTable
ALTER TABLE "KachaInvoiceItem" DROP COLUMN "metalType";

-- AlterTable
ALTER TABLE "KarigarJob" DROP COLUMN "metalType";

-- AlterTable
ALTER TABLE "KarigarReceiptItem" DROP COLUMN "metalType";

-- AlterTable
ALTER TABLE "LedgerEntry" DROP COLUMN "metalType";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "category",
DROP COLUMN "metalType",
DROP COLUMN "ornamentType";

-- AlterTable
ALTER TABLE "PurchaseItem" DROP COLUMN "metalType";

-- AlterTable
ALTER TABLE "QuotationItem" DROP COLUMN "metalType";

-- DropEnum
DROP TYPE "InventoryCategory";

-- DropEnum
DROP TYPE "MetalType";

-- DropEnum
DROP TYPE "OrnamentType";

