-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'NET_BANKING', 'CHEQUE', 'CARD', 'OTHER');

-- AlterTable
ALTER TABLE "InventoryStock" ADD COLUMN     "manufactureDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "attachmentUrl" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "paymentReference" TEXT;

