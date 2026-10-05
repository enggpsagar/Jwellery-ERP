import type { Metadata } from "next";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/auth";
import { getStockTagSettings } from "@/lib/actions/inventory/stock-tag-actions";
import { resolveStoreName } from "@/lib/invite-email";
import { requireStoreScope } from "@/lib/store-context";

import { SettingsTabs } from "@/components/settings/settings-tabs";
import { StockTagSettingsForm } from "@/components/settings/stock-tag-settings-form";
import { PageBackHeader } from "@/components/shared/page-back-header";

export const metadata: Metadata = {
  title: "QR & Barcode Tags",
};

export default async function TagSettingsPage() {
  const currentUser = await getCurrentUser();

  // Admin/Super Admin only — see the matching comment in ../page.tsx.
  const canEdit =
    currentUser?.role === UserRole.ADMIN ||
    currentUser?.role === UserRole.SUPER_ADMIN;
  if (!canEdit) redirect("/dashboard");

  const storeId = await requireStoreScope();
  const [settings, storeName] = await Promise.all([getStockTagSettings(), resolveStoreName(storeId)]);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <PageBackHeader
        title="QR & Barcode Tags"
        description="Choose what prints on your stock tags."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
      />

      <SettingsTabs active="tags" role={currentUser?.role} />

      <StockTagSettingsForm initial={settings} storeName={storeName} canEdit={canEdit} />
    </main>
  );
}
