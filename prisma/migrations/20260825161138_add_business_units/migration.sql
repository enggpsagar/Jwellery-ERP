-- CreateEnum
CREATE TYPE "BusinessUnit" AS ENUM ('MONEY', 'GOLD', 'SILVER', 'DIAMOND');

-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "businessUnits" "BusinessUnit"[] DEFAULT ARRAY['MONEY']::"BusinessUnit"[];
