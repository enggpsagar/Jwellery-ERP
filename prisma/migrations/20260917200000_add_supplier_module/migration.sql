-- Rename Customer.isVendor -> Customer.isSupplier (same column, same
-- existing data, purely a naming change to match the new Supplier module's
-- own vocabulary — see Customer.isSupplier's doc comment in schema.prisma).
ALTER TABLE "Customer" RENAME COLUMN "isVendor" TO "isSupplier";

-- New store-level toggle for the Supplier module's own UI (nav item, list
-- page, "Also Supplier" action, supplier ledger/balance section). Off by
-- default for every existing store — see supplierModuleEnabled's doc
-- comment in schema.prisma.
ALTER TABLE "BusinessSettings" ADD COLUMN "supplierModuleEnabled" BOOLEAN NOT NULL DEFAULT false;
