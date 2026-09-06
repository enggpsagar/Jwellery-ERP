-- CreateTable
CREATE TABLE "DraftOrder" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "karigarJobId" TEXT,
    "locationId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftOrderItem" (
    "id" TEXT NOT NULL,
    "draftOrderId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "metalTypeId" TEXT,
    "purity" "PurityType",
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "estimatedWeight" DECIMAL(12,5),
    "estimatedRate" DECIMAL(12,2),
    "designNotes" TEXT,
    "karigarReceiptItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DraftOrder_karigarJobId_key" ON "DraftOrder"("karigarJobId");

-- CreateIndex
CREATE INDEX "DraftOrder_storeId_status_idx" ON "DraftOrder"("storeId", "status");

-- CreateIndex
CREATE INDEX "DraftOrder_customerId_idx" ON "DraftOrder"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftOrder_storeId_orderNumber_key" ON "DraftOrder"("storeId", "orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DraftOrderItem_karigarReceiptItemId_key" ON "DraftOrderItem"("karigarReceiptItemId");

-- CreateIndex
CREATE INDEX "DraftOrderItem_draftOrderId_idx" ON "DraftOrderItem"("draftOrderId");

-- AddForeignKey
ALTER TABLE "DraftOrder" ADD CONSTRAINT "DraftOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftOrder" ADD CONSTRAINT "DraftOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftOrder" ADD CONSTRAINT "DraftOrder_karigarJobId_fkey" FOREIGN KEY ("karigarJobId") REFERENCES "KarigarJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftOrder" ADD CONSTRAINT "DraftOrder_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StoreLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftOrderItem" ADD CONSTRAINT "DraftOrderItem_draftOrderId_fkey" FOREIGN KEY ("draftOrderId") REFERENCES "DraftOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftOrderItem" ADD CONSTRAINT "DraftOrderItem_metalTypeId_fkey" FOREIGN KEY ("metalTypeId") REFERENCES "StoreMetal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftOrderItem" ADD CONSTRAINT "DraftOrderItem_karigarReceiptItemId_fkey" FOREIGN KEY ("karigarReceiptItemId") REFERENCES "KarigarReceiptItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
