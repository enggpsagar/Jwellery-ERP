-- Stone pieces / clarity / certificate number, saved on a piece's stone rows
-- and on single-stone sale lines (Invoice, Kacha, Quotation). Additive,
-- nullable columns only — no data changes.

-- AlterTable
ALTER TABLE "PieceComponent" ADD COLUMN "pieces" INTEGER,
ADD COLUMN "clarity" TEXT,
ADD COLUMN "certificateNumber" TEXT;

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN "stonePieces" INTEGER,
ADD COLUMN "stoneClarity" TEXT,
ADD COLUMN "stoneCertificateNumber" TEXT;

-- AlterTable
ALTER TABLE "KachaInvoiceItem" ADD COLUMN "stonePieces" INTEGER,
ADD COLUMN "stoneClarity" TEXT,
ADD COLUMN "stoneCertificateNumber" TEXT;

-- AlterTable
ALTER TABLE "QuotationItem" ADD COLUMN "stonePieces" INTEGER,
ADD COLUMN "stoneClarity" TEXT,
ADD COLUMN "stoneCertificateNumber" TEXT;
