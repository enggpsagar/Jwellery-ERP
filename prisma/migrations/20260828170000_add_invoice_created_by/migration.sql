-- Who raised each invoice. Nullable: invoices predating this have no answer.
ALTER TABLE "Invoice" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "createdByName" TEXT;

CREATE INDEX "Invoice_createdById_idx" ON "Invoice"("createdById");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
