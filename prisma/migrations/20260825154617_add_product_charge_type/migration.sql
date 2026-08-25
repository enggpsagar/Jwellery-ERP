-- CreateEnum
CREATE TYPE "ChargeType" AS ENUM ('FIXED', 'PERCENTAGE');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "defaultMakingChargeType" "ChargeType" NOT NULL DEFAULT 'FIXED',
ADD COLUMN     "defaultStoneChargeType" "ChargeType" NOT NULL DEFAULT 'FIXED';
