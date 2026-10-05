-- Metal/stone rows (PieceComponent) on Kacha slip and Quotation lines too.

-- AlterTable
ALTER TABLE "PieceComponent" ADD COLUMN     "kachaInvoiceItemId" TEXT,
ADD COLUMN     "quotationItemId" TEXT;

-- CreateIndex
CREATE INDEX "PieceComponent_kachaInvoiceItemId_idx" ON "PieceComponent"("kachaInvoiceItemId");

-- CreateIndex
CREATE INDEX "PieceComponent_quotationItemId_idx" ON "PieceComponent"("quotationItemId");

-- AddForeignKey
ALTER TABLE "PieceComponent" ADD CONSTRAINT "PieceComponent_kachaInvoiceItemId_fkey" FOREIGN KEY ("kachaInvoiceItemId") REFERENCES "KachaInvoiceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PieceComponent" ADD CONSTRAINT "PieceComponent_quotationItemId_fkey" FOREIGN KEY ("quotationItemId") REFERENCES "QuotationItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;


