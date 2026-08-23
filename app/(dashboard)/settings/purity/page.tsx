import Link from "next/link";
import { UserRole } from "@prisma/client";

import { getPurityFineness } from "@/lib/actions/purity-actions";
import { getCurrentUser } from "@/lib/auth/auth";

import { PuritySettingsForm } from "@/components/settings/purity-settings-form";
import { PageBackHeader } from "@/components/shared/page-back-header";

export default async function PuritySettingsPage() {
  const [rows, currentUser] = await Promise.all([
    getPurityFineness(),
    getCurrentUser(),
  ]);

  const canEdit =
    currentUser?.role === UserRole.ADMIN ||
    currentUser?.role === UserRole.SUPER_ADMIN;

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Purity & Carat Settings"
        description="Define the fine-metal percentage used to convert weights across purities."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
      />

      <div className="flex gap-4 border-b text-sm">
        <Link href="/settings" className="px-1 pb-2 text-muted-foreground hover:text-foreground">
          Business Settings
        </Link>
        <Link href="/settings/purity" className="border-b-2 border-primary px-1 pb-2 font-medium">
          Purity &amp; Carat
        </Link>
      </div>

      <PuritySettingsForm rows={rows} canEdit={canEdit} />
    </main>
  );
}
