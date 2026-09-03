-- Track who added an InventoryStock row and who recorded a Purchase, so the
-- Item Ledger report can show "Added by <Role>: <Name>" instead of a
-- hardcoded "Not recorded" for a manual stock add or a vendor purchase.
-- Nullable, snapshot-style (name/role captured at creation time) — same
-- convention as Invoice.createdById/createdByName.

-- AlterTable
ALTER TABLE "InventoryStock"
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "createdByName" TEXT,
  ADD COLUMN "createdByRole" "UserRole";

-- AlterTable
ALTER TABLE "Purchase"
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "createdByName" TEXT,
  ADD COLUMN "createdByRole" "UserRole";

-- AddForeignKey
ALTER TABLE "InventoryStock" ADD CONSTRAINT "InventoryStock_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
