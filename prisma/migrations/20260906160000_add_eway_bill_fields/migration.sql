-- E-way Bill — record-keeping only, no government API involved. The
-- store generates the actual bill on ewaybillgst.gov.in and enters its
-- number back here so it prints on the invoice.

-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('ROAD', 'RAIL', 'AIR', 'SHIP');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "ewayBillNumber" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "ewayBillDate" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "transporterName" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "vehicleNumber" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "transportMode" "TransportMode";
ALTER TABLE "Invoice" ADD COLUMN "distanceKm" INTEGER;
