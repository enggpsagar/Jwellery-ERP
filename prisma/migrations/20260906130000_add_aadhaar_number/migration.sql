-- Optional KYC id on Customer, Vendor and User — validated (12 digits +
-- Verhoeff checksum, see lib/aadhaar.ts) only when actually entered.

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "aadhaarNumber" TEXT;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN "aadhaarNumber" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "aadhaarNumber" TEXT;
