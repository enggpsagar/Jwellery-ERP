-- Optional metal specialization on Karigar (Gold/Silver/Diamond/...),
-- distinct from the existing free-text `specialization` craft field.
-- Nullable, no backfill needed: only drives the Karigars page's Type filter.

-- AlterTable
ALTER TABLE "Karigar" ADD COLUMN "metalTypeId" TEXT;

-- CreateIndex
CREATE INDEX "Karigar_metalTypeId_idx" ON "Karigar"("metalTypeId");

-- AddForeignKey
ALTER TABLE "Karigar" ADD CONSTRAINT "Karigar_metalTypeId_fkey" FOREIGN KEY ("metalTypeId") REFERENCES "StoreMetal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
