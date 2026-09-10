-- CreateEnum
CREATE TYPE "PrintLayout" AS ENUM ('A4', 'THERMAL');

-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "printLayout" "PrintLayout" NOT NULL DEFAULT 'A4';
