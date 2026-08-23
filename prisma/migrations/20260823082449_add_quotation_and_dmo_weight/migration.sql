-- AlterTable
ALTER TABLE "InventoryStock" ADD COLUMN     "dmoWeight" DECIMAL(10,3);

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "dmoWeight" DECIMAL(10,3);

-- AlterTable
ALTER TABLE "KachaInvoiceItem" ADD COLUMN     "dmoWeight" DECIMAL(10,3);

-- AlterTable
ALTER TABLE "KarigarReceiptItem" ADD COLUMN     "dmoWeight" DECIMAL(10,3);

-- AlterTable
ALTER TABLE "PurchaseItem" ADD COLUMN     "dmoWeight" DECIMAL(10,3);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "quotationNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "quotationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "makingCharges" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stoneCharges" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "convertedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationItem" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
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

    CONSTRAINT "QuotationItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_convertedToId_key" ON "Quotation"("convertedToId");

-- CreateIndex
CREATE INDEX "Quotation_customerId_idx" ON "Quotation"("customerId");

-- CreateIndex
CREATE INDEX "Quotation_quotationDate_idx" ON "Quotation"("quotationDate");

-- CreateIndex
CREATE INDEX "Quotation_storeId_idx" ON "Quotation"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_storeId_quotationNumber_key" ON "Quotation"("storeId", "quotationNumber");

-- CreateIndex
CREATE INDEX "QuotationItem_quotationId_idx" ON "QuotationItem"("quotationId");

-- CreateIndex
CREATE INDEX "QuotationItem_inventoryStockId_idx" ON "QuotationItem"("inventoryStockId");

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_convertedToId_fkey" FOREIGN KEY ("convertedToId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_inventoryStockId_fkey" FOREIGN KEY ("inventoryStockId") REFERENCES "InventoryStock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
