import { UserRole } from "@prisma/client";

import { listApiKeys } from "@/lib/actions/api-key-actions";
import { getCurrentUser } from "@/lib/auth/auth";

import { ApiKeySettingsForm } from "@/components/settings/api-key-settings-form";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { PageBackHeader } from "@/components/shared/page-back-header";

export default async function ApiKeysSettingsPage() {
  const [keys, currentUser] = await Promise.all([
    listApiKeys(),
    getCurrentUser(),
  ]);

  const canEdit =
    currentUser?.role === UserRole.ADMIN ||
    currentUser?.role === UserRole.SUPER_ADMIN;

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="API Keys"
        description="Credentials for a future mobile app or an AI assistant (via MCP) to act on this store directly — scoped to only the permissions you grant."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
      />

      <SettingsTabs active="api-keys" />

      <ApiKeySettingsForm keys={keys} canEdit={canEdit} />
    </main>
  );
}
