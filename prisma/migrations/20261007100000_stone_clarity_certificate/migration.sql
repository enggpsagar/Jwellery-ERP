-- Diamond clarity + IGI certificate number per product stone row.
ALTER TABLE "ProductStoneComponent" ADD COLUMN "clarity" TEXT;
ALTER TABLE "ProductStoneComponent" ADD COLUMN "certificateNumber" TEXT;
