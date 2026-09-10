-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "collaborationCode" TEXT,
ADD COLUMN     "collaborationCodeGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "collaborationCodeVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "StoreCollaborationAccess" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "superAdminUserId" TEXT NOT NULL,
    "grantedCodeVersion" INTEGER NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreCollaborationAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreCollaborationAccess_storeId_idx" ON "StoreCollaborationAccess"("storeId");

-- CreateIndex
CREATE INDEX "StoreCollaborationAccess_superAdminUserId_idx" ON "StoreCollaborationAccess"("superAdminUserId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreCollaborationAccess_storeId_superAdminUserId_key" ON "StoreCollaborationAccess"("storeId", "superAdminUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Store_collaborationCode_key" ON "Store"("collaborationCode");

-- AddForeignKey
ALTER TABLE "StoreCollaborationAccess" ADD CONSTRAINT "StoreCollaborationAccess_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreCollaborationAccess" ADD CONSTRAINT "StoreCollaborationAccess_superAdminUserId_fkey" FOREIGN KEY ("superAdminUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
