-- Settings > Tags: which fields the QR and Barcode stock tags print.
-- Additive with defaults; existing stores get the defaults below.
ALTER TABLE "BusinessSettings"
  ADD COLUMN "qrTagFields" TEXT[] DEFAULT ARRAY['TAG_CODE', 'PRODUCT_NAME', 'PRODUCT_CODE', 'METALS', 'GROSS_WEIGHT', 'NET_WEIGHT', 'STONES', 'MFG_DATE']::TEXT[],
  ADD COLUMN "barcodeTagFields" TEXT[] DEFAULT ARRAY['STORE_NAME', 'TAG_CODE', 'METALS', 'GROSS_WEIGHT', 'NET_WEIGHT', 'STONES']::TEXT[];
