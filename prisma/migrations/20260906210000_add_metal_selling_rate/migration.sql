-- CreateTable
CREATE TABLE "MetalSellingRate" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "purity" "PurityType" NOT NULL,
    "sellingPrice" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetalSellingRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetalSellingRate_storeId_purity_key" ON "MetalSellingRate"("storeId", "purity");

-- AddForeignKey
ALTER TABLE "MetalSellingRate" ADD CONSTRAINT "MetalSellingRate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
