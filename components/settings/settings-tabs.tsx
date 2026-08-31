import Link from "next/link";

type SettingsTab = "business" | "purity" | "taxonomy" | "locations" | "api-keys";

type SettingsTabsProps = {
  active: SettingsTab;
};

const TABS: { id: SettingsTab; href: string; label: string }[] = [
  { id: "business", href: "/settings", label: "Business Settings" },
  { id: "purity", href: "/settings/purity", label: "Purity & Carat" },
  { id: "taxonomy", href: "/settings/taxonomy", label: "Metals & Categories" },
  { id: "locations", href: "/settings/locations", label: "Locations" },
  { id: "api-keys", href: "/settings/api-keys", label: "API Keys" },
];

export function SettingsTabs({ active }: SettingsTabsProps) {
  return (
    <div className="flex gap-4 border-b text-sm">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          className={
            tab.id === active
              ? "border-b-2 border-primary px-1 pb-2 font-medium"
              : "px-1 pb-2 text-muted-foreground hover:text-foreground"
          }
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
