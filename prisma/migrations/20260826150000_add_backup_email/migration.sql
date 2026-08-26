-- Backup destination for destructive bulk operations (e.g. delete-all Kacha slips).
-- Nullable, so no backfill is needed for existing rows.
ALTER TABLE "BusinessSettings" ADD COLUMN "backupEmail" TEXT;
