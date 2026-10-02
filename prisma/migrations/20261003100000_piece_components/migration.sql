-- Pieces made of several metals and stones (lib/piece-components.ts):
-- one row per metal / stone under a sale line, purchase line or stock row.

-- CreateEnum
CREATE TYPE "PieceComponentKind" AS ENUM ('METAL', 'STONE');

-- CreateTable
CREATE TABLE "PieceComponent" (
    "id" TEXT NOT NULL,
    "kind" "PieceComponentKind" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metalTypeId" TEXT,
    "purity" "PurityType",
    "purityLabel" TEXT,
    "grossWeight" DECIMAL(12,5),
    "netWeight" DECIMAL(12,5),
    "fineWeight" DECIMAL(12,5),
    "stoneMetalTypeName" TEXT,
    "stoneTypeNames" TEXT,
    "caratWeight" DECIMAL(10,3),
    "stoneWeight" DECIMAL(12,5),
    "rate" DECIMAL(12,2),
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "gstRateId" TEXT,
    "gstRateName" TEXT,
    "gstRatePercent" DECIMAL(5,2),
    "invoiceItemId" TEXT,
    "purchaseItemId" TEXT,
    "inventoryStockId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PieceComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PieceComponent_invoiceItemId_idx" ON "PieceComponent"("invoiceItemId");

-- CreateIndex
CREATE INDEX "PieceComponent_purchaseItemId_idx" ON "PieceComponent"("purchaseItemId");

-- CreateIndex
CREATE INDEX "PieceComponent_inventoryStockId_idx" ON "PieceComponent"("inventoryStockId");

-- CreateIndex
CREATE INDEX "PieceComponent_metalTypeId_idx" ON "PieceComponent"("metalTypeId");

-- AddForeignKey
ALTER TABLE "PieceComponent" ADD CONSTRAINT "PieceComponent_metalTypeId_fkey" FOREIGN KEY ("metalTypeId") REFERENCES "StoreMetal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PieceComponent" ADD CONSTRAINT "PieceComponent_invoiceItemId_fkey" FOREIGN KEY ("invoiceItemId") REFERENCES "InvoiceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PieceComponent" ADD CONSTRAINT "PieceComponent_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "PurchaseItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PieceComponent" ADD CONSTRAINT "PieceComponent_inventoryStockId_fkey" FOREIGN KEY ("inventoryStockId") REFERENCES "InventoryStock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

