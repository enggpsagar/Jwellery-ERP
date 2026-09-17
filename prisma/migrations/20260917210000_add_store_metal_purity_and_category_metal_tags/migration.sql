-- AlterTable
ALTER TABLE "DraftOrderItem" ADD COLUMN     "purityLabel" TEXT;

-- AlterTable
ALTER TABLE "InventoryStock" ADD COLUMN     "purityLabel" TEXT;

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "purityLabel" TEXT;

-- AlterTable
ALTER TABLE "KachaInvoiceItem" ADD COLUMN     "purityLabel" TEXT;

-- AlterTable
ALTER TABLE "KarigarJob" ADD COLUMN     "issuePurityLabel" TEXT;

-- AlterTable
ALTER TABLE "KarigarReceiptItem" ADD COLUMN     "purityLabel" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "storeMetalPurityId" TEXT;

-- AlterTable
ALTER TABLE "PurchaseItem" ADD COLUMN     "purityLabel" TEXT;

-- AlterTable
ALTER TABLE "QuotationItem" ADD COLUMN     "purityLabel" TEXT;

-- AlterTable
ALTER TABLE "StoreMetalOrigin" ADD COLUMN     "gramsPerCarat" DECIMAL(6,4) NOT NULL DEFAULT 0.2,
ADD COLUMN     "sellingPrice" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "StoreMetalPurity" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "storeMetalId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "skuCode" TEXT NOT NULL,
    "finenessPercent" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "sellingPrice" DECIMAL(12,2),
    "isHallmarkable" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreMetalPurity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreCategoryMetal" (
    "id" TEXT NOT NULL,
    "storeCategoryId" TEXT NOT NULL,
    "storeMetalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreCategoryMetal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreMetalPurity_storeMetalId_label_key" ON "StoreMetalPurity"("storeMetalId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "StoreCategoryMetal_storeCategoryId_storeMetalId_key" ON "StoreCategoryMetal"("storeCategoryId", "storeMetalId");

-- CreateIndex
CREATE INDEX "Product_storeMetalPurityId_idx" ON "Product"("storeMetalPurityId");

-- AddForeignKey
ALTER TABLE "StoreMetalPurity" ADD CONSTRAINT "StoreMetalPurity_storeMetalId_fkey" FOREIGN KEY ("storeMetalId") REFERENCES "StoreMetal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreCategoryMetal" ADD CONSTRAINT "StoreCategoryMetal_storeCategoryId_fkey" FOREIGN KEY ("storeCategoryId") REFERENCES "StoreCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreCategoryMetal" ADD CONSTRAINT "StoreCategoryMetal_storeMetalId_fkey" FOREIGN KEY ("storeMetalId") REFERENCES "StoreMetal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_storeMetalPurityId_fkey" FOREIGN KEY ("storeMetalPurityId") REFERENCES "StoreMetalPurity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
