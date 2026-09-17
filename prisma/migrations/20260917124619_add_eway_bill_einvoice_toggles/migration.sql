-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "ewayBillEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "eInvoiceEnabled" BOOLEAN NOT NULL DEFAULT true;
