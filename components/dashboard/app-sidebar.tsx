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
} from "lucide-react";

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

const mainNav = [
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
    title: "Gold & Silver Ledger",
    href: "/ledger",
    icon: CircleDollarSign,
  },
  {
    title: "Inventory",
    href: "/inventory",
    icon: Package,
  },
  {
    title: "Karigar Management",
    href: "/karigars",
    icon: Hammer,
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
];

function isNavItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

type NavItem = (typeof mainNav)[number];

function SidebarNavItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  const isActive = isNavItemActive(pathname, item.href);
  const hasSubItems = "items" in item && item.items;
  const isSubItemActive =
    hasSubItems && item.items!.some((subItem) => pathname === subItem.href);

  const [open, setOpen] = useState(isSubItemActive);

  if (!hasSubItems) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
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
        onClick={() => setOpen(true)}
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
              <SidebarMenuSubButton asChild isActive={pathname === subItem.href}>
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

export function AppSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
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
              {mainNav.map((item) => (
                <SidebarNavItem key={item.title} item={item} pathname={pathname} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isNavItemActive(pathname, "/settings")}
                  tooltip="Settings"
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
      </SidebarContent>

      <SidebarFooter className="border-t">
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{userInitials || "U"}</AvatarFallback>
          </Avatar>

          <div className="group-data-[collapsible=icon]:hidden">
            <div className="text-sm font-medium">{userName}</div>
            <div className="text-xs text-muted-foreground">
              {session?.user?.role ?? "Store Owner"}
            </div>
          </div>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
