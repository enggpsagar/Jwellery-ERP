-- Old Gold Exchange: old gold bought from a customer against a sale.
-- (The Store_defaultLocationId_idx drift Prisma also reports is pre-existing
-- and deliberately left out.)

-- CreateEnum
CREATE TYPE "OldGoldExcessMode" AS ENUM ('STORE_CREDIT', 'PAID_OUT');

-- AlterEnum
ALTER TYPE "LedgerSourceType" ADD VALUE 'OLD_GOLD_EXCHANGE';

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "exchangeInvoiceId" TEXT,
ADD COLUMN     "isOldGoldExchange" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "oldGoldAppliedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "oldGoldExcessAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "oldGoldExcessMode" "OldGoldExcessMode";

-- AlterTable
ALTER TABLE "PurchaseItem" ADD COLUMN     "deductionPercent" DECIMAL(5,2);

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_exchangeInvoiceId_key" ON "Purchase"("exchangeInvoiceId");

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_exchangeInvoiceId_fkey" FOREIGN KEY ("exchangeInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

