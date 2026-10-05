-- Offers & gift vouchers redeemed at billing (lib/promotions.ts).

-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('PERCENT_OFF', 'FLAT_OFF', 'BUY_X_GET_Y');

-- CreateEnum
CREATE TYPE "PromotionTarget" AS ENUM ('BILL', 'MAKING_CHARGES');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "promotionCode" TEXT,
ADD COLUMN     "promotionDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "promotionId" TEXT;

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "PromotionType" NOT NULL,
    "target" "PromotionTarget" NOT NULL DEFAULT 'BILL',
    "percentOff" DECIMAL(5,2),
    "amountOff" DECIMAL(12,2),
    "buyQuantity" INTEGER,
    "getQuantity" INTEGER,
    "getPercentOff" DECIMAL(5,2) DEFAULT 100,
    "maxDiscount" DECIMAL(12,2),
    "minBillAmount" DECIMAL(12,2),
    "categoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metalTypeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "code" TEXT,
    "usageLimit" INTEGER,
    "perCustomerLimit" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionVoucher" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "customerId" TEXT,
    "note" TEXT,
    "expiresAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    "invoiceId" TEXT,

    CONSTRAINT "PromotionVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Promotion_storeId_idx" ON "Promotion"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Promotion_storeId_code_key" ON "Promotion"("storeId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionVoucher_invoiceId_key" ON "PromotionVoucher"("invoiceId");

-- CreateIndex
CREATE INDEX "PromotionVoucher_promotionId_idx" ON "PromotionVoucher"("promotionId");

-- CreateIndex
CREATE INDEX "PromotionVoucher_customerId_idx" ON "PromotionVoucher"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionVoucher_storeId_code_key" ON "PromotionVoucher"("storeId", "code");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionVoucher" ADD CONSTRAINT "PromotionVoucher_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionVoucher" ADD CONSTRAINT "PromotionVoucher_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionVoucher" ADD CONSTRAINT "PromotionVoucher_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;


