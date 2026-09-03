-- Adds a human-readable, platform-wide ticket number to SupportTicket
-- (`TKT-{year}-{padded sequence}`), mirroring the `{prefix}-{year}-{padded
-- count}` shape every other numbered document in this schema already uses
-- (Invoice.invoiceNumber, Quotation.quotationNumber, etc. — see each one's
-- own generate*Number in lib/actions/*.ts), except counted across every
-- store rather than one, since a ticket is platform-wide, not per-store.
--
-- Added nullable first so existing rows can be backfilled in creation
-- order before the NOT NULL + unique constraint is applied — same
-- "backfill before tightening" order as the 20260903050000 migration.

-- AlterTable: add as nullable
ALTER TABLE "SupportTicket" ADD COLUMN     "ticketNumber" TEXT;

-- Backfill existing rows, numbered per-year in creation order.
WITH numbered AS (
  SELECT
    "id",
    'TKT-' || EXTRACT(YEAR FROM "createdAt") || '-' ||
      LPAD(
        ROW_NUMBER() OVER (
          PARTITION BY EXTRACT(YEAR FROM "createdAt")
          ORDER BY "createdAt" ASC
        )::text,
        4,
        '0'
      ) AS "ticketNumber"
  FROM "SupportTicket"
)
UPDATE "SupportTicket" t
SET "ticketNumber" = numbered."ticketNumber"
FROM numbered
WHERE t."id" = numbered."id";

-- AlterTable: now that every row has a value, tighten to NOT NULL
ALTER TABLE "SupportTicket" ALTER COLUMN "ticketNumber" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_ticketNumber_key" ON "SupportTicket"("ticketNumber");
