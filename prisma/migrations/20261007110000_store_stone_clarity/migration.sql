-- Store-managed diamond clarity grades (Settings → Taxonomy → Stone Clarity).
CREATE TABLE "StoreStoneClarity" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreStoneClarity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoreStoneClarity_storeId_name_key" ON "StoreStoneClarity"("storeId", "name");

ALTER TABLE "StoreStoneClarity" ADD CONSTRAINT "StoreStoneClarity_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
