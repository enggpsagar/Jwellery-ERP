-- Curated State subset for the Invoice Delivery Location picker (see
-- BusinessSettings.allowedDeliveryStateIds' doc comment in schema.prisma).
-- Empty array (the default for every existing store) means "no curation
-- yet" and keeps showing every state, so this is a no-op for stores that
-- never touch the new Settings checkbox list.
ALTER TABLE "BusinessSettings" ADD COLUMN "allowedDeliveryStateIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
