-- Cross-device scanning: a laptop opens a session, a phone's scans land in it.
CREATE TABLE "ScanSession" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScanSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScanSessionItem" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScanSessionItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScanSession_userId_isActive_idx" ON "ScanSession"("userId", "isActive");
CREATE INDEX "ScanSession_storeId_idx" ON "ScanSession"("storeId");
CREATE INDEX "ScanSessionItem_sessionId_createdAt_idx" ON "ScanSessionItem"("sessionId", "createdAt");

ALTER TABLE "ScanSession" ADD CONSTRAINT "ScanSession_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScanSession" ADD CONSTRAINT "ScanSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScanSessionItem" ADD CONSTRAINT "ScanSessionItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ScanSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
