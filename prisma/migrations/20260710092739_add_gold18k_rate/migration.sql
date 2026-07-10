/*
  Warnings:

  - Added the required column `gold18k` to the `MetalRate` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "MetalRate" ADD COLUMN     "gold18k" DECIMAL(12,2) NOT NULL;
