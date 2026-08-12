-- CreateEnum
CREATE TYPE "InventoryFinish" AS ENUM ('KACHA', 'PAKKA');

-- AlterTable
ALTER TABLE "InventoryStock" ADD COLUMN     "finish" "InventoryFinish" NOT NULL DEFAULT 'KACHA';

-- CreateTable
CREATE TABLE "KachaInvoice" (
    "id" TEXT NOT NULL,
    "slipNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PAID',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "makingCharges" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stoneCharges" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balanceAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "convertedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KachaInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KachaInvoiceItem" (
    "id" TEXT NOT NULL,
    "kachaInvoiceId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "metalType" "MetalType",
    "purity" "PurityType",
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "grossWeight" DECIMAL(10,3),
    "netWeight" DECIMAL(10,3),
    "rate" DECIMAL(12,2),
    "makingCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stoneCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "inventoryStockId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KachaInvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KachaInvoice_slipNumber_key" ON "KachaInvoice"("slipNumber");

-- CreateIndex
CREATE UNIQUE INDEX "KachaInvoice_convertedToId_key" ON "KachaInvoice"("convertedToId");

-- CreateIndex
CREATE INDEX "KachaInvoice_customerId_idx" ON "KachaInvoice"("customerId");

-- CreateIndex
CREATE INDEX "KachaInvoice_invoiceDate_idx" ON "KachaInvoice"("invoiceDate");

-- CreateIndex
CREATE INDEX "KachaInvoice_status_idx" ON "KachaInvoice"("status");

-- CreateIndex
CREATE INDEX "KachaInvoice_slipNumber_idx" ON "KachaInvoice"("slipNumber");

-- CreateIndex
CREATE INDEX "KachaInvoiceItem_kachaInvoiceId_idx" ON "KachaInvoiceItem"("kachaInvoiceId");

-- CreateIndex
CREATE INDEX "KachaInvoiceItem_inventoryStockId_idx" ON "KachaInvoiceItem"("inventoryStockId");

-- CreateIndex
CREATE INDEX "InventoryStock_finish_idx" ON "InventoryStock"("finish");

-- AddForeignKey
ALTER TABLE "KachaInvoice" ADD CONSTRAINT "KachaInvoice_convertedToId_fkey" FOREIGN KEY ("convertedToId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KachaInvoice" ADD CONSTRAINT "KachaInvoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KachaInvoiceItem" ADD CONSTRAINT "KachaInvoiceItem_inventoryStockId_fkey" FOREIGN KEY ("inventoryStockId") REFERENCES "InventoryStock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KachaInvoiceItem" ADD CONSTRAINT "KachaInvoiceItem_kachaInvoiceId_fkey" FOREIGN KEY ("kachaInvoiceId") REFERENCES "KachaInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
