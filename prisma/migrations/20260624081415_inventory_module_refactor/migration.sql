/*
  Warnings:

  - You are about to drop the column `inventoryItemId` on the `InvoiceItem` table. All the data in the column will be lost.
  - You are about to drop the column `inventoryItemId` on the `KarigarJob` table. All the data in the column will be lost.
  - You are about to drop the `InventoryItem` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "OrnamentType" AS ENUM ('RING', 'NECKLACE', 'PAYAL', 'CHAIN', 'BANGLE', 'BRACELET', 'PENDANT', 'EARRING', 'NOSE_PIN', 'MANGALSUTRA', 'ANKLET', 'KADA', 'BROOCH', 'COIN', 'BAR', 'OTHER');

-- CreateEnum
CREATE TYPE "PurityType" AS ENUM ('GOLD_18K', 'GOLD_20K', 'GOLD_22K', 'GOLD_24K', 'SILVER_925', 'SILVER_999', 'OTHER');

-- CreateEnum
CREATE TYPE "InventoryStockStatus" AS ENUM ('IN_STOCK', 'SOLD', 'RESERVED', 'ISSUED_TO_KARIGAR', 'DAMAGED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "InventoryTransactionType" AS ENUM ('OPENING', 'PURCHASE', 'SALE', 'SALE_RETURN', 'KARIGAR_ISSUE', 'KARIGAR_RECEIPT', 'ADJUSTMENT', 'DAMAGE', 'RESERVE', 'UNRESERVE');

-- DropForeignKey
ALTER TABLE "InvoiceItem" DROP CONSTRAINT "InvoiceItem_inventoryItemId_fkey";

-- DropForeignKey
ALTER TABLE "KarigarJob" DROP CONSTRAINT "KarigarJob_inventoryItemId_fkey";

-- DropIndex
DROP INDEX "InvoiceItem_inventoryItemId_idx";

-- DropIndex
DROP INDEX "KarigarJob_inventoryItemId_idx";

-- AlterTable
ALTER TABLE "InvoiceItem" DROP COLUMN "inventoryItemId",
ADD COLUMN     "inventoryStockId" TEXT,
ADD COLUMN     "purity" "PurityType";

-- AlterTable
ALTER TABLE "KarigarJob" DROP COLUMN "inventoryItemId",
ADD COLUMN     "inventoryStockId" TEXT;

-- AlterTable
ALTER TABLE "MetalRate" ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'GRAM';

-- DropTable
DROP TABLE "InventoryItem";

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "InventoryCategory" NOT NULL DEFAULT 'ORNAMENT',
    "ornamentType" "OrnamentType",
    "metalType" "MetalType" NOT NULL DEFAULT 'GOLD',
    "defaultPurity" "PurityType",
    "defaultMakingCharge" DECIMAL(12,2),
    "defaultStoneCharge" DECIMAL(12,2),
    "designCode" TEXT,
    "hsnCode" TEXT,
    "description" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryStock" (
    "id" TEXT NOT NULL,
    "stockCode" TEXT NOT NULL,
    "tagNumber" TEXT,
    "productId" TEXT NOT NULL,
    "metalType" "MetalType" NOT NULL,
    "purity" "PurityType",
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "InventoryStockStatus" NOT NULL DEFAULT 'IN_STOCK',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "grossWeight" DECIMAL(10,3),
    "lessWeight" DECIMAL(10,3),
    "netWeight" DECIMAL(10,3),
    "stoneWeight" DECIMAL(10,3),
    "wastagePercent" DECIMAL(5,2),
    "purchaseRate" DECIMAL(12,2),
    "saleRate" DECIMAL(12,2),
    "makingCharge" DECIMAL(12,2),
    "stoneCharge" DECIMAL(12,2),
    "otherCharge" DECIMAL(12,2),
    "purchaseAmount" DECIMAL(12,2),
    "saleAmount" DECIMAL(12,2),
    "vendorName" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "location" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" TEXT NOT NULL,
    "inventoryStockId" TEXT NOT NULL,
    "transactionType" "InventoryTransactionType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "grossWeight" DECIMAL(10,3),
    "netWeight" DECIMAL(10,3),
    "referenceType" TEXT,
    "referenceId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_productCode_key" ON "Product"("productCode");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "Product_productCode_idx" ON "Product"("productCode");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "Product_ornamentType_idx" ON "Product"("ornamentType");

-- CreateIndex
CREATE INDEX "Product_metalType_idx" ON "Product"("metalType");

-- CreateIndex
CREATE INDEX "Product_designCode_idx" ON "Product"("designCode");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryStock_stockCode_key" ON "InventoryStock"("stockCode");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryStock_tagNumber_key" ON "InventoryStock"("tagNumber");

-- CreateIndex
CREATE INDEX "InventoryStock_stockCode_idx" ON "InventoryStock"("stockCode");

-- CreateIndex
CREATE INDEX "InventoryStock_tagNumber_idx" ON "InventoryStock"("tagNumber");

-- CreateIndex
CREATE INDEX "InventoryStock_productId_idx" ON "InventoryStock"("productId");

-- CreateIndex
CREATE INDEX "InventoryStock_metalType_idx" ON "InventoryStock"("metalType");

-- CreateIndex
CREATE INDEX "InventoryStock_purity_idx" ON "InventoryStock"("purity");

-- CreateIndex
CREATE INDEX "InventoryStock_status_idx" ON "InventoryStock"("status");

-- CreateIndex
CREATE INDEX "InventoryStock_purchaseDate_idx" ON "InventoryStock"("purchaseDate");

-- CreateIndex
CREATE INDEX "InventoryStock_location_idx" ON "InventoryStock"("location");

-- CreateIndex
CREATE INDEX "InventoryTransaction_inventoryStockId_idx" ON "InventoryTransaction"("inventoryStockId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_transactionType_idx" ON "InventoryTransaction"("transactionType");

-- CreateIndex
CREATE INDEX "InventoryTransaction_referenceType_referenceId_idx" ON "InventoryTransaction"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_createdAt_idx" ON "InventoryTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "Customer_customerCode_idx" ON "Customer"("customerCode");

-- CreateIndex
CREATE INDEX "Invoice_invoiceNumber_idx" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "InvoiceItem_inventoryStockId_idx" ON "InvoiceItem"("inventoryStockId");

-- CreateIndex
CREATE INDEX "KarigarJob_inventoryStockId_idx" ON "KarigarJob"("inventoryStockId");

-- CreateIndex
CREATE INDEX "KarigarJob_jobNumber_idx" ON "KarigarJob"("jobNumber");

-- CreateIndex
CREATE INDEX "LedgerEntry_sourceType_idx" ON "LedgerEntry"("sourceType");

-- AddForeignKey
ALTER TABLE "InventoryStock" ADD CONSTRAINT "InventoryStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_inventoryStockId_fkey" FOREIGN KEY ("inventoryStockId") REFERENCES "InventoryStock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_inventoryStockId_fkey" FOREIGN KEY ("inventoryStockId") REFERENCES "InventoryStock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KarigarJob" ADD CONSTRAINT "KarigarJob_inventoryStockId_fkey" FOREIGN KEY ("inventoryStockId") REFERENCES "InventoryStock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
