-- CreateEnum
CREATE TYPE "BrandFontFamily" AS ENUM ('INTER', 'ROBOTO', 'POPPINS', 'MERRIWEATHER', 'PLAYFAIR_DISPLAY', 'LATO');

-- CreateEnum
CREATE TYPE "BrandRadius" AS ENUM ('SHARP', 'DEFAULT', 'ROUNDED');

-- CreateTable
CREATE TABLE "StoreBranding" (
    "storeId" TEXT NOT NULL,
    "accentColor" TEXT,
    "backgroundColor" TEXT,
    "cardColor" TEXT,
    "foregroundColor" TEXT,
    "fontFamily" "BrandFontFamily" NOT NULL DEFAULT 'INTER',
    "radius" "BrandRadius" NOT NULL DEFAULT 'DEFAULT',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreBranding_pkey" PRIMARY KEY ("storeId")
);

-- AddForeignKey
ALTER TABLE "StoreBranding" ADD CONSTRAINT "StoreBranding_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
