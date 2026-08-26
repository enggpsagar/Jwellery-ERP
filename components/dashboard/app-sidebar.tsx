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
} from "lucide-react";

import { ROLE_LABELS, MODULE_DEFINITIONS } from "@/lib/roles";

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
    if (item.href === "/stores") return role === "SUPER_ADMIN";
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
const ACTIVE_NAV_CLASS =
  "data-active:!bg-sidebar-primary/25 data-active:!text-sidebar-primary data-active:font-semibold data-active:border-l-2 data-active:border-sidebar-primary";

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
  const userInitials = userName
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Sidebar
      collapsible="icon"
      className="bg-zinc-950 text-white border-r border-zinc-800"
    >
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Gem className="h-5 w-5" />
          </div>

          <div className="group-data-[collapsible=icon]:hidden">
            <h2 className="font-semibold">Swarna Suite</h2>
            <p className="text-xs text-muted-foreground">Jewellery ERP</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>

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
            <SidebarGroupLabel>System</SidebarGroupLabel>

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

      <SidebarFooter className="border-t">
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{userInitials || "U"}</AvatarFallback>
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
