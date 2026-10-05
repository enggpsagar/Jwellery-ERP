-- Customer Exchange against a Kacha slip (Purchase.exchangeKachaInvoiceId) and
-- as an estimate on a Quotation (Quotation.exchangeEstimate).

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "exchangeKachaInvoiceId" TEXT;

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "exchangeEstimate" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_exchangeKachaInvoiceId_key" ON "Purchase"("exchangeKachaInvoiceId");

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_exchangeKachaInvoiceId_fkey" FOREIGN KEY ("exchangeKachaInvoiceId") REFERENCES "KachaInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;


