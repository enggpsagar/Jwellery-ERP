-- AlterTable
ALTER TABLE "DraftOrder" ADD COLUMN     "estimatedTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "draftOrderId" TEXT;

-- CreateIndex
CREATE INDEX "LedgerEntry_draftOrderId_idx" ON "LedgerEntry"("draftOrderId");

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_draftOrderId_fkey" FOREIGN KEY ("draftOrderId") REFERENCES "DraftOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
