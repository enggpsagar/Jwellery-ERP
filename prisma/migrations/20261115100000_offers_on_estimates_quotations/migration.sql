-- Offers & gift vouchers on Estimates (Kacha) and Quotations. Additive only:
-- every new column is nullable or defaults to 0, so code from before this
-- migration keeps working after it runs (migrate first, then deploy).

-- AlterTable
ALTER TABLE "KachaInvoice" ADD COLUMN     "promotionCode" TEXT,
ADD COLUMN     "promotionDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "promotionId" TEXT;

-- AlterTable
ALTER TABLE "KachaInvoiceItem" ADD COLUMN     "promoDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PromotionVoucher" ADD COLUMN     "kachaInvoiceId" TEXT;

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "promotionCode" TEXT,
ADD COLUMN     "promotionDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "promotionId" TEXT;

-- AlterTable
ALTER TABLE "QuotationItem" ADD COLUMN     "promoDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "PromotionVoucher_kachaInvoiceId_key" ON "PromotionVoucher"("kachaInvoiceId");

-- AddForeignKey
ALTER TABLE "KachaInvoice" ADD CONSTRAINT "KachaInvoice_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionVoucher" ADD CONSTRAINT "PromotionVoucher_kachaInvoiceId_fkey" FOREIGN KEY ("kachaInvoiceId") REFERENCES "KachaInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

