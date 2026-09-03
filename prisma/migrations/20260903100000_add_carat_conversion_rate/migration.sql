-- CreateTable
CREATE TABLE "CaratConversionRate" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "purity" "PurityType" NOT NULL,
    "gramsPerCarat" DECIMAL(6,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaratConversionRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CaratConversionRate_storeId_purity_key" ON "CaratConversionRate"("storeId", "purity");

-- AddForeignKey
ALTER TABLE "CaratConversionRate" ADD CONSTRAINT "CaratConversionRate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
