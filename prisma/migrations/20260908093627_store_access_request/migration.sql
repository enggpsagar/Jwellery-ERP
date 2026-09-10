-- CreateTable
CREATE TABLE "StoreAccessRequest" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "superAdminUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "respondedByUserId" TEXT,

    CONSTRAINT "StoreAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreAccessRequest_storeId_status_idx" ON "StoreAccessRequest"("storeId", "status");

-- CreateIndex
CREATE INDEX "StoreAccessRequest_superAdminUserId_idx" ON "StoreAccessRequest"("superAdminUserId");

-- AddForeignKey
ALTER TABLE "StoreAccessRequest" ADD CONSTRAINT "StoreAccessRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreAccessRequest" ADD CONSTRAINT "StoreAccessRequest_superAdminUserId_fkey" FOREIGN KEY ("superAdminUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreAccessRequest" ADD CONSTRAINT "StoreAccessRequest_respondedByUserId_fkey" FOREIGN KEY ("respondedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
