-- AlterTable
ALTER TABLE "InventoryStock" ADD COLUMN     "metalTypeId" TEXT;

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "metalTypeId" TEXT;

-- AlterTable
ALTER TABLE "KachaInvoiceItem" ADD COLUMN     "metalTypeId" TEXT;

-- AlterTable
ALTER TABLE "KarigarJob" ADD COLUMN     "metalTypeId" TEXT;

-- AlterTable
ALTER TABLE "KarigarReceiptItem" ADD COLUMN     "metalTypeId" TEXT;

-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "metalTypeId" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "categoryTypeId" TEXT,
ADD COLUMN     "metalTypeId" TEXT;

-- AlterTable
ALTER TABLE "PurchaseItem" ADD COLUMN     "metalTypeId" TEXT;

-- AlterTable
ALTER TABLE "QuotationItem" ADD COLUMN     "metalTypeId" TEXT;

-- CreateTable
CREATE TABLE "StoreMetal" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hasPurity" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreMetal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreCategory" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreCategoryType" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreCategoryType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreMetal_storeId_name_key" ON "StoreMetal"("storeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "StoreCategory_storeId_name_key" ON "StoreCategory"("storeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "StoreCategoryType_categoryId_name_key" ON "StoreCategoryType"("categoryId", "name");

-- CreateIndex
CREATE INDEX "InventoryStock_metalTypeId_idx" ON "InventoryStock"("metalTypeId");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_categoryTypeId_idx" ON "Product"("categoryTypeId");

-- CreateIndex
CREATE INDEX "Product_metalTypeId_idx" ON "Product"("metalTypeId");

-- AddForeignKey
ALTER TABLE "StoreMetal" ADD CONSTRAINT "StoreMetal_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreCategory" ADD CONSTRAINT "StoreCategory_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreCategoryType" ADD CONSTRAINT "StoreCategoryType_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "StoreCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "StoreCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryTypeId_fkey" FOREIGN KEY ("categoryTypeId") REFERENCES "StoreCategoryType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_metalTypeId_fkey" FOREIGN KEY ("metalTypeId") REFERENCES "StoreMetal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStock" ADD CONSTRAINT "InventoryStock_metalTypeId_fkey" FOREIGN KEY ("metalTypeId") REFERENCES "StoreMetal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KachaInvoiceItem" ADD CONSTRAINT "KachaInvoiceItem_metalTypeId_fkey" FOREIGN KEY ("metalTypeId") REFERENCES "StoreMetal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_metalTypeId_fkey" FOREIGN KEY ("metalTypeId") REFERENCES "StoreMetal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_metalTypeId_fkey" FOREIGN KEY ("metalTypeId") REFERENCES "StoreMetal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KarigarJob" ADD CONSTRAINT "KarigarJob_metalTypeId_fkey" FOREIGN KEY ("metalTypeId") REFERENCES "StoreMetal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_metalTypeId_fkey" FOREIGN KEY ("metalTypeId") REFERENCES "StoreMetal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KarigarReceiptItem" ADD CONSTRAINT "KarigarReceiptItem_metalTypeId_fkey" FOREIGN KEY ("metalTypeId") REFERENCES "StoreMetal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_metalTypeId_fkey" FOREIGN KEY ("metalTypeId") REFERENCES "StoreMetal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

