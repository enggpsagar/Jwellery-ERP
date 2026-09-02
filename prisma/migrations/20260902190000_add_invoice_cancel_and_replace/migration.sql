-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "cancelledByName" TEXT,
ADD COLUMN     "replacesId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_replacesId_key" ON "Invoice"("replacesId");

-- CreateIndex
CREATE INDEX "Invoice_cancelledById_idx" ON "Invoice"("cancelledById");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_replacesId_fkey" FOREIGN KEY ("replacesId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
