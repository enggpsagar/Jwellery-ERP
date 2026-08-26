-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "KachaInvoice" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "Karigar" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "KarigarJob" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "locationId" TEXT;

-- CreateTable
CREATE TABLE "UserLocationAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserLocationAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserLocationAccess_userId_idx" ON "UserLocationAccess"("userId");

-- CreateIndex
CREATE INDEX "UserLocationAccess_locationId_idx" ON "UserLocationAccess"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "UserLocationAccess_userId_locationId_key" ON "UserLocationAccess"("userId", "locationId");

-- CreateIndex
CREATE INDEX "Invoice_locationId_idx" ON "Invoice"("locationId");

-- CreateIndex
CREATE INDEX "KachaInvoice_locationId_idx" ON "KachaInvoice"("locationId");

-- CreateIndex
CREATE INDEX "Karigar_locationId_idx" ON "Karigar"("locationId");

-- CreateIndex
CREATE INDEX "KarigarJob_locationId_idx" ON "KarigarJob"("locationId");

-- CreateIndex
CREATE INDEX "LedgerEntry_locationId_idx" ON "LedgerEntry"("locationId");

-- CreateIndex
CREATE INDEX "Purchase_locationId_idx" ON "Purchase"("locationId");

-- AddForeignKey
ALTER TABLE "UserLocationAccess" ADD CONSTRAINT "UserLocationAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLocationAccess" ADD CONSTRAINT "UserLocationAccess_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StoreLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Karigar" ADD CONSTRAINT "Karigar_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StoreLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StoreLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KachaInvoice" ADD CONSTRAINT "KachaInvoice_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StoreLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StoreLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KarigarJob" ADD CONSTRAINT "KarigarJob_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StoreLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StoreLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
