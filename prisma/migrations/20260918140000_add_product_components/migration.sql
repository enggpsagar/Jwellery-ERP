-- CreateTable
CREATE TABLE "ProductMetalComponent" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "metalTypeId" TEXT NOT NULL,
    "storeMetalPurityId" TEXT,
    "grossWeight" DECIMAL(12,5),
    "netWeight" DECIMAL(12,5),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductMetalComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductStoneComponent" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "stoneMetalTypeName" TEXT NOT NULL,
    "stoneTypeNames" TEXT,
    "caratWeight" DECIMAL(10,3),
    "stoneWeight" DECIMAL(12,5),
    "stoneRate" DECIMAL(12,2),
    "stoneCharge" DECIMAL(12,2),
    "stoneChargeType" "ChargeType" NOT NULL DEFAULT 'FIXED',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductStoneComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductMetalComponent_productId_idx" ON "ProductMetalComponent"("productId");

-- CreateIndex
CREATE INDEX "ProductMetalComponent_metalTypeId_idx" ON "ProductMetalComponent"("metalTypeId");

-- CreateIndex
CREATE INDEX "ProductMetalComponent_storeMetalPurityId_idx" ON "ProductMetalComponent"("storeMetalPurityId");

-- CreateIndex
CREATE INDEX "ProductStoneComponent_productId_idx" ON "ProductStoneComponent"("productId");

-- AddForeignKey
ALTER TABLE "ProductMetalComponent" ADD CONSTRAINT "ProductMetalComponent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMetalComponent" ADD CONSTRAINT "ProductMetalComponent_metalTypeId_fkey" FOREIGN KEY ("metalTypeId") REFERENCES "StoreMetal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMetalComponent" ADD CONSTRAINT "ProductMetalComponent_storeMetalPurityId_fkey" FOREIGN KEY ("storeMetalPurityId") REFERENCES "StoreMetalPurity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStoneComponent" ADD CONSTRAINT "ProductStoneComponent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
