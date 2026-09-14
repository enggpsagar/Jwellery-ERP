-- AlterEnum
ALTER TYPE "BrandFontFamily" ADD VALUE 'MONTSERRAT';
ALTER TYPE "BrandFontFamily" ADD VALUE 'NUNITO';
ALTER TYPE "BrandFontFamily" ADD VALUE 'OPEN_SANS';
ALTER TYPE "BrandFontFamily" ADD VALUE 'RALEWAY';
ALTER TYPE "BrandFontFamily" ADD VALUE 'WORK_SANS';
ALTER TYPE "BrandFontFamily" ADD VALUE 'OSWALD';

-- AlterTable
ALTER TABLE "StoreBranding" ADD COLUMN     "cancelColor" TEXT,
ADD COLUMN     "deleteColor" TEXT,
ADD COLUMN     "editColor" TEXT,
ADD COLUMN     "exportColor" TEXT,
ADD COLUMN     "headerColor" TEXT,
ADD COLUMN     "importColor" TEXT,
ADD COLUMN     "showIcons" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sidebarColor" TEXT,
ADD COLUMN     "statusActiveColor" TEXT,
ADD COLUMN     "statusCompletedColor" TEXT,
ADD COLUMN     "statusDraftColor" TEXT,
ADD COLUMN     "statusInactiveColor" TEXT,
ADD COLUMN     "statusPendingColor" TEXT;
