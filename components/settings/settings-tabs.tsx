import Link from "next/link";
import { UserRole } from "@prisma/client";
import { Building2, Gem, Layers, MapPin, KeyRound, Percent, ShieldCheck } from "lucide-react";

type SettingsTab =
  | "business"
  | "purity"
  | "taxonomy"
  | "locations"
  | "api-keys"
  | "gst-rates"
  | "collaboration";

type SettingsTabsProps = {
  active: SettingsTab;
  /**
   * Collaboration is ADMIN-only (see its own page's doc comment — a Super
   * Admin generating their own access code would defeat the point). A
   * Super Admin can still reach every other settings page while working in
   * a store they've been granted access to, so without this the tab would
   * sit there next to ones that work, only to redirect straight back to
   * /dashboard the moment it's clicked. Every settings page already
   * computes `currentUser` and must pass its role here.
   */
  role?: UserRole;
};

const TABS: {
  id: SettingsTab;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  /** Each tab keeps its own icon color regardless of active state — same
   * "tellable apart at a glance" reasoning as the ribbon-colored Artisan
   * balance cards, just applied to a tab bar instead of a card grid. */
  tint: string;
}[] = [
  { id: "business", href: "/settings", label: "Business Settings", icon: Building2, tint: "var(--chart-1)" },
  { id: "purity", href: "/settings/purity", label: "Purity & Carat", icon: Gem, tint: "var(--chart-2)" },
  { id: "taxonomy", href: "/settings/taxonomy", label: "Metals & Categories", icon: Layers, tint: "var(--chart-3)" },
  { id: "locations", href: "/settings/locations", label: "Locations", icon: MapPin, tint: "var(--chart-4)" },
  { id: "api-keys", href: "/settings/api-keys", label: "API Keys", icon: KeyRound, tint: "var(--chart-5)" },
  { id: "gst-rates", href: "/settings/gst-rates", label: "GST Rates", icon: Percent, tint: "#0891b2" },
  { id: "collaboration", href: "/settings/collaboration", label: "Collaboration", icon: ShieldCheck, tint: "#be123c" },
];

export function SettingsTabs({ active, role }: SettingsTabsProps) {
  const visibleTabs = TABS.filter((tab) => tab.id !== "collaboration" || role === UserRole.ADMIN);

  return (
    <div className="flex flex-wrap gap-1 border-b">
      {visibleTabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === active;

        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={
              isActive
                ? "flex items-center gap-2 border-b-2 border-primary px-3 pb-2.5 pt-1 text-sm font-medium text-foreground"
                : "flex items-center gap-2 border-b-2 border-transparent px-3 pb-2.5 pt-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            }
          >
            <Icon className="h-4 w-4" style={{ color: tab.tint }} />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
