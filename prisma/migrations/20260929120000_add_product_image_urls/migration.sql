-- Optional product photos (Vercel Blob URLs), first = cover. Additive with
-- a default, so existing rows and the currently deployed code are unaffected.
ALTER TABLE "Product" ADD COLUMN "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
