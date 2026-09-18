import type { Metadata } from "next";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { getStoreBranding } from "@/lib/actions/branding-actions";
import { getCurrentUser } from "@/lib/auth/auth";

import { BrandingForm } from "@/components/settings/branding-form";
import { PageBackHeader } from "@/components/shared/page-back-header";

export const metadata: Metadata = {
  title: "Branding",
};

/**
 * Store-owner-editable branding — accent/background/card/text color, font,
 * corner style — applied across the whole app for this store via the
 * (dashboard) layout's CSS-variable override (see lib/branding.ts and
 * app/(dashboard)/layout.tsx's brandingStyle).
 *
 * Was a Super-Admin-only static design-system reference page (colors/
 * components hardcoded against app/globals.css, nothing editable) — that
 * content is gone, not merged in here, since a live editor and a read-only
 * reference doc serve different audiences and mixing them would clutter
 * both. The route (/brand-guide) and its nav label were kept internally,
 * only the page's actual content and audience changed.
 *
 * Deliberately NOT customizable from this page (see StoreBranding's own
 * schema doc comment for the full reasoning): the semantic status colors
 * (success/warning/danger/info) and the chart-1/3/4/5 module tint rotation
 * stay fixed app-wide — they carry meaning (and, for the chart palette,
 * validated color-blind-safe contrast) that a per-store override would
 * undermine. The sidebar's own dark chrome also stays constant regardless
 * of a store's accent choice — deliberate brand consistency for "this is
 * the app," not an oversight. Dark mode always uses the app's own built-in
 * dark palette, never a store's light-mode customization blended into it.
 */
export default async function BrandGuidePage() {
  const currentUser = await getCurrentUser();

  // Same gate as /settings — already enforced in middleware.ts, re-checked
  // here as defense-in-depth (see SettingsPage's own doc comment on this
  // exact convention).
  const canEdit =
    currentUser?.role === UserRole.ADMIN ||
    currentUser?.role === UserRole.SUPER_ADMIN;
  if (!canEdit) redirect("/dashboard");

  const settings = await getStoreBranding();

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <PageBackHeader
        title="Branding"
        description="Customize the accent color, background, font, font weight/style, and corner style your store's staff see across the whole app."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
      />

      <BrandingForm settings={settings} canEdit={canEdit} />
    </main>
  );
}
