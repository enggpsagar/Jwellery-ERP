-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "irnNumber" TEXT,
ADD COLUMN     "ackNumber" TEXT,
ADD COLUMN     "ackDate" TIMESTAMP(3);
