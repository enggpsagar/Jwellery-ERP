-- CreateTable
CREATE TABLE "MetalRate" (
    "id" TEXT NOT NULL,
    "gold22k" DECIMAL(12,2) NOT NULL,
    "gold24k" DECIMAL(12,2) NOT NULL,
    "silver" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetalRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetalRate_createdAt_idx" ON "MetalRate"("createdAt");
