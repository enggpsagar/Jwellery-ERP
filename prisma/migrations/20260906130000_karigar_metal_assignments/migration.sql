-- CreateTable
CREATE TABLE "KarigarMetal" (
    "id" TEXT NOT NULL,
    "karigarId" TEXT NOT NULL,
    "metalTypeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KarigarMetal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KarigarMetal_karigarId_idx" ON "KarigarMetal"("karigarId");

-- CreateIndex
CREATE INDEX "KarigarMetal_metalTypeId_idx" ON "KarigarMetal"("metalTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "KarigarMetal_karigarId_metalTypeId_key" ON "KarigarMetal"("karigarId", "metalTypeId");

-- AddForeignKey
ALTER TABLE "KarigarMetal" ADD CONSTRAINT "KarigarMetal_karigarId_fkey" FOREIGN KEY ("karigarId") REFERENCES "Karigar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KarigarMetal" ADD CONSTRAINT "KarigarMetal_metalTypeId_fkey" FOREIGN KEY ("metalTypeId") REFERENCES "StoreMetal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
