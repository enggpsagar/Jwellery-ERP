-- CreateEnum
CREATE TYPE "InvoiceTemplate" AS ENUM ('CLASSIC', 'MODERN', 'MINIMAL', 'ELEGANT');

-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "invoiceTemplate" "InvoiceTemplate" NOT NULL DEFAULT 'CLASSIC';
