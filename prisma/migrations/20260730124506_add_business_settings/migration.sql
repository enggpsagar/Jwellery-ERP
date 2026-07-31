-- CreateTable
CREATE TABLE "BusinessSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "businessName" TEXT NOT NULL,
    "legalName" TEXT,
    "gstNumber" TEXT,
    "panNumber" TEXT,
    "stateCode" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "invoicePrefix" TEXT NOT NULL DEFAULT 'INV',
    "invoiceStartingNo" INTEGER NOT NULL DEFAULT 1,
    "invoiceTerms" TEXT,
    "invoiceNotes" TEXT,
    "defaultGstRate" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    "financialYearStartMonth" INTEGER NOT NULL DEFAULT 4,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessSettings_pkey" PRIMARY KEY ("id")
);
