"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Users,
  UserCog,
  CircleDollarSign,
  Package,
  ReceiptText,
  Hammer,
  BarChart3,
  Settings,
  Gem,
  ChevronRight,
  Store,
  ClipboardList,
  Truck,
  PackagePlus,
  FileText,
  CreditCard,
} from "lucide-react";

import { ROLE_LABELS, MODULE_DEFINITIONS } from "@/lib/roles";
import { avatarColor, initialsOf } from "@/lib/avatar-color";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type NavItem = {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  items?: { title: string; href: string }[];
};

const mainNav: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Customers",
    href: "/customers",
    icon: Users,
  },
  {
    title: "Vendors",
    href: "/vendors",
    icon: Truck,
  },
  {
    title: "Ledger",
    href: "/ledger",
    icon: CircleDollarSign,
  },
  {
    title: "Inventory",
    href: "/inventory",
    icon: Package,
    items: [
      { title: "Products", href: "/inventory/products" },
      { title: "Stock", href: "/inventory/stock" },
    ],
  },
  {
    title: "Purchases",
    href: "/purchases",
    icon: PackagePlus,
  },
  {
    title: "Karigar Management",
    href: "/karigars",
    icon: Hammer,
  },
  {
    title: "Quotations",
    href: "/quotations",
    icon: FileText,
  },
  {
    title: "Billing",
    href: "/billing",
    icon: ReceiptText,
    items: [
      { title: "Pakka Invoices", href: "/billing" },
      { title: "Kacha Slips", href: "/billing/kacha" },
    ],
  },
  {
    title: "Reports",
    href: "/reports",
    icon: BarChart3,
  },
  {
    title: "Users",
    href: "/users",
    icon: UserCog,
  },
  {
    title: "Stores",
    href: "/stores",
    icon: Store,
  },
  {
    title: "Plans",
    href: "/plans",
    icon: CreditCard,
  },
];

const karigarNav: NavItem[] = [
  {
    title: "My Jobs",
    href: "/my-jobs",
    icon: ClipboardList,
  },
];

function getNavForRole(role?: string, permissions: string[] = []) {
  if (role === "KARIGAR") return karigarNav;

  return mainNav.filter((item) => {
    if (item.href === "/stores" || item.href === "/plans") return role === "SUPER_ADMIN";
    if (item.href === "/users") return role === "SUPER_ADMIN" || role === "ADMIN";

    // Empty permissions means "not customized" — falls back to full access,
    // matching getEffectivePermissions() in lib/roles.ts.
    if (role === "STAFF" && permissions.length > 0) {
      const module = MODULE_DEFINITIONS.find((definition) => definition.href === item.href);
      if (module) {
        return module.permissions.every((permission) => permissions.includes(permission));
      }
    }

    return true;
  });
}

function isNavItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// The sidebar is hardcoded dark (bg-zinc-950) regardless of the app's light/dark
// mode, so the active state must use the sidebar-specific accent tokens — the
// plain `primary` token resolves to near-black in light mode and is invisible here.
// The sidebar is a fixed dark surface, so it cannot use the theme's
// `sidebar-primary` token — that resolves near-black in light mode and
// disappears here. Gold from the chart palette instead: a left rail plus a
// faint wash, which marks the active item without a heavy filled pill.
const ACTIVE_NAV_CLASS = [
  "data-active:!bg-[color-mix(in_oklab,var(--chart-2)_16%,transparent)]",
  "data-active:!text-[color-mix(in_oklab,var(--chart-2)_75%,white)]",
  "data-active:font-semibold",
  "data-active:border-l-2",
  "data-active:border-l-[var(--chart-2)]",
  // Inactive items sit back until hovered, so the active one is the only
  // thing competing for attention.
  "text-white/70 hover:text-white hover:bg-card/5",
].join(" ");

function SidebarNavItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  const isActive = isNavItemActive(pathname, item.href);
  const hasSubItems = "items" in item && item.items;
  const isSubItemActive =
    hasSubItems && item.items!.some((subItem) => pathname === subItem.href);

  const [manuallyOpened, setManuallyOpened] = useState(false);
  const open = isSubItemActive || manuallyOpened;

  if (!hasSubItems) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={isActive}
          tooltip={item.title}
          className={ACTIVE_NAV_CLASS}
        >
          <Link href={item.href}>
            <Icon className="h-4 w-4" />
            <span>{item.title}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={item.title}
        onClick={() => setManuallyOpened(true)}
        className={ACTIVE_NAV_CLASS}
      >
        <Link href={item.href}>
          <Icon className="h-4 w-4" />
          <span>{item.title}</span>
          <ChevronRight
            className={`ml-auto h-4 w-4 shrink-0 transition-transform ${
              open ? "rotate-90" : ""
            }`}
          />
        </Link>
      </SidebarMenuButton>

      {open && (
        <SidebarMenuSub>
          {item.items!.map((subItem) => (
            <SidebarMenuSubItem key={subItem.title}>
              <SidebarMenuSubButton
                asChild
                isActive={pathname === subItem.href}
                className={ACTIVE_NAV_CLASS}
              >
                <Link href={subItem.href}>
                  <span>{subItem.title}</span>
                </Link>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
}

type AppSidebarProps = {
  storeName?: string | null;
  storeLogoUrl?: string | null;
};

export function AppSidebar({ storeName, storeLogoUrl }: AppSidebarProps = {}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const navItems = getNavForRole(role, session?.user?.permissions);
  const showSettings = role !== "STAFF" && role !== "KARIGAR" && role !== "MANAGER";
  const userName = session?.user?.name ?? "User";
  const userInitials = initialsOf(userName);
  const avatar = avatarColor(userName);

  return (
    <Sidebar
      collapsible="icon"
      // A warm near-black rather than flat zinc: zinc is a cool grey, which
      // fights the gold accent. The right edge carries the same gold hairline
      // as the top bar so the two chrome surfaces agree.
      className="border-r border-r-transparent bg-[#12100d] text-white [border-image:linear-gradient(180deg,color-mix(in_oklab,var(--chart-2)_34%,transparent),transparent_60%)_1]"
    >
      <SidebarHeader className="border-b border-white/10">
        <div className="flex items-center gap-3 px-2 py-2">
          {/* Gold, not `bg-primary` — primary resolves to near-black, which
              is invisible against this surface. */}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[color-mix(in_oklab,var(--chart-2)_88%,black)] text-white shadow-[0_0_0_1px_color-mix(in_oklab,var(--chart-2)_45%,transparent)]">
            {storeLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={storeLogoUrl}
                alt={storeName ?? "Store logo"}
                className="h-full w-full object-cover"
              />
            ) : (
              <Gem className="h-5 w-5" />
            )}
          </div>

          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <h2 className="truncate font-semibold">{storeName || "Swarna Suite"}</h2>
            <p className="text-xs text-muted-foreground">Jewellery ERP</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
            Workspace
          </SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarNavItem key={item.title} item={item} pathname={pathname} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {showSettings && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
              System
            </SidebarGroupLabel>

            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isNavItemActive(pathname, "/settings")}
                    tooltip="Settings"
                    className={ACTIVE_NAV_CLASS}
                  >
                    <Link href="/settings">
                      <Settings className="h-4 w-4" />
                      <span>Settings</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-white/10">
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="font-semibold" style={avatar.style}>
              {userInitials}
            </AvatarFallback>
          </Avatar>

          <div className="group-data-[collapsible=icon]:hidden">
            <div className="text-sm font-medium">{userName}</div>
            <div className="text-xs text-muted-foreground">
              {role ? ROLE_LABELS[role as keyof typeof ROLE_LABELS] : "Store Owner"}
            </div>
          </div>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
