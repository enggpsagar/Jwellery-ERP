-- AlterTable
ALTER TABLE "DraftOrderItem" ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "categoryTypeId" TEXT;

-- CreateIndex
CREATE INDEX "DraftOrderItem_categoryId_idx" ON "DraftOrderItem"("categoryId");

-- CreateIndex
CREATE INDEX "DraftOrderItem_categoryTypeId_idx" ON "DraftOrderItem"("categoryTypeId");

-- AddForeignKey
ALTER TABLE "DraftOrderItem" ADD CONSTRAINT "DraftOrderItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "StoreCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftOrderItem" ADD CONSTRAINT "DraftOrderItem_categoryTypeId_fkey" FOREIGN KEY ("categoryTypeId") REFERENCES "StoreCategoryType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
