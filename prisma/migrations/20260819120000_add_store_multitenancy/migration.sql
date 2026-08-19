-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';
ALTER TYPE "UserRole" ADD VALUE 'KARIGAR';

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "gstNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Store_code_key" ON "Store"("code");

-- CreateIndex
CREATE INDEX "Store_code_idx" ON "Store"("code");

-- Backfill: one default store for all pre-existing data
INSERT INTO "Store" ("id", "name", "code", "isActive", "createdAt", "updatedAt")
VALUES ('store_main_default', 'Main Store', 'MAIN', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable: Customer
ALTER TABLE "Customer" ADD COLUMN "storeId" TEXT;
UPDATE "Customer" SET "storeId" = 'store_main_default' WHERE "storeId" IS NULL;
ALTER TABLE "Customer" ALTER COLUMN "storeId" SET NOT NULL;

-- AlterTable: InventoryStock
ALTER TABLE "InventoryStock" ADD COLUMN "storeId" TEXT;
UPDATE "InventoryStock" SET "storeId" = 'store_main_default' WHERE "storeId" IS NULL;
ALTER TABLE "InventoryStock" ALTER COLUMN "storeId" SET NOT NULL;

-- AlterTable: Invoice
ALTER TABLE "Invoice" ADD COLUMN "storeId" TEXT;
UPDATE "Invoice" SET "storeId" = 'store_main_default' WHERE "storeId" IS NULL;
ALTER TABLE "Invoice" ALTER COLUMN "storeId" SET NOT NULL;

-- AlterTable: KachaInvoice
ALTER TABLE "KachaInvoice" ADD COLUMN "storeId" TEXT;
UPDATE "KachaInvoice" SET "storeId" = 'store_main_default' WHERE "storeId" IS NULL;
ALTER TABLE "KachaInvoice" ALTER COLUMN "storeId" SET NOT NULL;

-- AlterTable: Karigar
ALTER TABLE "Karigar" ADD COLUMN "storeId" TEXT;
UPDATE "Karigar" SET "storeId" = 'store_main_default' WHERE "storeId" IS NULL;
ALTER TABLE "Karigar" ALTER COLUMN "storeId" SET NOT NULL;

-- AlterTable: KarigarJob
ALTER TABLE "KarigarJob" ADD COLUMN "storeId" TEXT;
UPDATE "KarigarJob" SET "storeId" = 'store_main_default' WHERE "storeId" IS NULL;
ALTER TABLE "KarigarJob" ALTER COLUMN "storeId" SET NOT NULL;

-- AlterTable: LedgerEntry
ALTER TABLE "LedgerEntry" ADD COLUMN "storeId" TEXT;
UPDATE "LedgerEntry" SET "storeId" = 'store_main_default' WHERE "storeId" IS NULL;
ALTER TABLE "LedgerEntry" ALTER COLUMN "storeId" SET NOT NULL;

-- AlterTable: MetalRate
ALTER TABLE "MetalRate" ADD COLUMN "storeId" TEXT;
UPDATE "MetalRate" SET "storeId" = 'store_main_default' WHERE "storeId" IS NULL;
ALTER TABLE "MetalRate" ALTER COLUMN "storeId" SET NOT NULL;

-- AlterTable: Product
ALTER TABLE "Product" ADD COLUMN "storeId" TEXT;
UPDATE "Product" SET "storeId" = 'store_main_default' WHERE "storeId" IS NULL;
ALTER TABLE "Product" ALTER COLUMN "storeId" SET NOT NULL;

-- AlterTable: User (nullable — null means Super Admin / all-stores access)
ALTER TABLE "User" ADD COLUMN "storeId" TEXT,
ADD COLUMN "karigarId" TEXT;
UPDATE "User" SET "storeId" = 'store_main_default' WHERE "storeId" IS NULL;

-- AlterTable: InviteToken (nullable, only set for store-scoped invites)
ALTER TABLE "InviteToken" ADD COLUMN "storeId" TEXT;

-- AlterTable: BusinessSettings (singleton "default" row -> one row per store)
ALTER TABLE "BusinessSettings" ADD COLUMN "storeId" TEXT;
UPDATE "BusinessSettings" SET "storeId" = 'store_main_default' WHERE "storeId" IS NULL;
ALTER TABLE "BusinessSettings" DROP CONSTRAINT "BusinessSettings_pkey";
ALTER TABLE "BusinessSettings" DROP COLUMN "id";
ALTER TABLE "BusinessSettings" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "BusinessSettings" ADD CONSTRAINT "BusinessSettings_pkey" PRIMARY KEY ("storeId");

-- DropIndex (old global-uniqueness indexes, superseded by per-store compound uniques)
DROP INDEX "Customer_customerCode_key";
DROP INDEX "InventoryStock_stockCode_key";
DROP INDEX "InventoryStock_tagNumber_key";
DROP INDEX "Invoice_invoiceNumber_key";
DROP INDEX "KachaInvoice_slipNumber_key";
DROP INDEX "Karigar_code_key";
DROP INDEX "KarigarJob_jobNumber_key";
DROP INDEX "Product_productCode_key";

-- CreateIndex
CREATE INDEX "Customer_storeId_idx" ON "Customer"("storeId");
CREATE UNIQUE INDEX "Customer_storeId_customerCode_key" ON "Customer"("storeId", "customerCode");

CREATE INDEX "InventoryStock_storeId_idx" ON "InventoryStock"("storeId");
CREATE UNIQUE INDEX "InventoryStock_storeId_stockCode_key" ON "InventoryStock"("storeId", "stockCode");
CREATE UNIQUE INDEX "InventoryStock_storeId_tagNumber_key" ON "InventoryStock"("storeId", "tagNumber");

CREATE INDEX "InviteToken_storeId_idx" ON "InviteToken"("storeId");

CREATE INDEX "Invoice_storeId_idx" ON "Invoice"("storeId");
CREATE UNIQUE INDEX "Invoice_storeId_invoiceNumber_key" ON "Invoice"("storeId", "invoiceNumber");

CREATE INDEX "KachaInvoice_storeId_idx" ON "KachaInvoice"("storeId");
CREATE UNIQUE INDEX "KachaInvoice_storeId_slipNumber_key" ON "KachaInvoice"("storeId", "slipNumber");

CREATE INDEX "Karigar_storeId_idx" ON "Karigar"("storeId");
CREATE UNIQUE INDEX "Karigar_storeId_code_key" ON "Karigar"("storeId", "code");

CREATE INDEX "KarigarJob_storeId_idx" ON "KarigarJob"("storeId");
CREATE UNIQUE INDEX "KarigarJob_storeId_jobNumber_key" ON "KarigarJob"("storeId", "jobNumber");

CREATE INDEX "LedgerEntry_storeId_idx" ON "LedgerEntry"("storeId");

CREATE INDEX "MetalRate_storeId_idx" ON "MetalRate"("storeId");

CREATE INDEX "Product_storeId_idx" ON "Product"("storeId");
CREATE UNIQUE INDEX "Product_storeId_productCode_key" ON "Product"("storeId", "productCode");

CREATE UNIQUE INDEX "User_karigarId_key" ON "User"("karigarId");
CREATE INDEX "User_storeId_idx" ON "User"("storeId");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Karigar" ADD CONSTRAINT "Karigar_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryStock" ADD CONSTRAINT "InventoryStock_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KachaInvoice" ADD CONSTRAINT "KachaInvoice_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KarigarJob" ADD CONSTRAINT "KarigarJob_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MetalRate" ADD CONSTRAINT "MetalRate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BusinessSettings" ADD CONSTRAINT "BusinessSettings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_karigarId_fkey" FOREIGN KEY ("karigarId") REFERENCES "Karigar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InviteToken" ADD CONSTRAINT "InviteToken_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
