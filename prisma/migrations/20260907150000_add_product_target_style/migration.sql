-- CreateEnum
CREATE TYPE "TargetStyle" AS ENUM ('LADIES', 'GENTS', 'KIDS', 'UNISEX');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "targetStyle" "TargetStyle";
