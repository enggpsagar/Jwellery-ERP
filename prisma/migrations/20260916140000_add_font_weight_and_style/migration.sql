-- CreateEnum
CREATE TYPE "BrandFontWeight" AS ENUM ('LIGHT', 'NORMAL', 'MEDIUM', 'SEMIBOLD', 'BOLD', 'EXTRABOLD');

-- CreateEnum
CREATE TYPE "BrandFontStyle" AS ENUM ('NORMAL', 'ITALIC');

-- AlterTable
ALTER TABLE "StoreBranding" ADD COLUMN     "fontWeight" "BrandFontWeight" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "fontStyle" "BrandFontStyle" NOT NULL DEFAULT 'NORMAL';
