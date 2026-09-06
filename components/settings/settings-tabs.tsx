import Link from "next/link";
import { Building2, Gem, Layers, MapPin, KeyRound } from "lucide-react";

type SettingsTab = "business" | "purity" | "taxonomy" | "locations" | "api-keys";

type SettingsTabsProps = {
  active: SettingsTab;
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
];

export function SettingsTabs({ active }: SettingsTabsProps) {
  return (
    <div className="flex flex-wrap gap-1 border-b">
      {TABS.map((tab) => {
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
