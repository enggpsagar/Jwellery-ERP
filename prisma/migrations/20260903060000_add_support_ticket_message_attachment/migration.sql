-- Adds optional single-attachment support to SupportTicketMessage (image,
-- PDF or video/screen-recording), uploaded directly from the browser to
-- Vercel Blob (see app/api/support-tickets/upload/route.ts) and referenced
-- here by URL — same single-nullable-field convention as
-- LedgerEntry.attachmentUrl, no separate Attachment/Media model. All four
-- columns are nullable and only ever populated together.

-- AlterTable
ALTER TABLE "SupportTicketMessage" ADD COLUMN     "attachmentUrl" TEXT,
ADD COLUMN     "attachmentName" TEXT,
ADD COLUMN     "attachmentMimeType" TEXT,
ADD COLUMN     "attachmentSize" INTEGER;
