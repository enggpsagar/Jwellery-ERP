-- Pre-fills the Location field wherever one is picked while creating a
-- record, so a single-location store never has to pick the same one every
-- time. Nullable: existing stores get none until set from Settings.

-- AlterTable
ALTER TABLE "Store" ADD COLUMN "defaultLocationId" TEXT;

-- CreateIndex
CREATE INDEX "Store_defaultLocationId_idx" ON "Store"("defaultLocationId");

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_defaultLocationId_fkey" FOREIGN KEY ("defaultLocationId") REFERENCES "StoreLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
