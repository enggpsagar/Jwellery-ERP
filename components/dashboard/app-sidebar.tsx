"use client";

import { useEffect, useState } from "react";
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
  Plus,
} from "lucide-react";

import { ROLE_LABELS, MODULE_DEFINITIONS } from "@/lib/roles";
import { APP_NAME } from "@/lib/constants/app";
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
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { SidebarCounts } from "@/lib/actions/sidebar-actions";

type CountKey = keyof SidebarCounts;

type NavItem = {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** When set, renders a live record-count badge beside this item —
   * omitted for items with no single "count of records" meaning
   * (Dashboard, Ledger, Reports, Plans, and any parent with sub-items). */
  countKey?: CountKey;
  /** quickAddHref, when set, renders a persistent "+" beside that sub-item —
   * a direct link to its Create/New page, skipping the list-then-Add-button
   * detour. Omitted for sub-items with no single obvious "new" page. */
  items?: { title: string; href: string; quickAddHref?: string; countKey?: CountKey }[];
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
    countKey: "customers",
  },
  {
    title: "Vendors",
    href: "/vendors",
    icon: Truck,
    countKey: "vendors",
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
      { title: "Products", href: "/inventory/products", quickAddHref: "/inventory/products/new", countKey: "products" },
      { title: "Stock", href: "/inventory/stock", quickAddHref: "/inventory/stock/new", countKey: "stock" },
    ],
  },
  {
    title: "Purchases",
    href: "/purchases",
    icon: PackagePlus,
    countKey: "purchases",
  },
  {
    title: "Karigar",
    href: "/karigars",
    icon: Hammer,
    countKey: "karigars",
  },
  {
    title: "Quotations",
    href: "/quotations",
    icon: FileText,
    countKey: "quotations",
  },
  {
    title: "Billing",
    href: "/billing",
    icon: ReceiptText,
    items: [
      { title: "Pakka Invoices", href: "/billing", quickAddHref: "/billing/new", countKey: "invoices" },
      { title: "Kacha Slips", href: "/billing/kacha", quickAddHref: "/billing/kacha/new", countKey: "kachaInvoices" },
      // No quickAddHref — a Credit Note is always issued from an existing
      // invoice's return flow, there is no standalone "new" page for one.
      { title: "Credit Notes", href: "/billing/credit-notes", countKey: "creditNotes" },
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
    countKey: "users",
  },
  {
    title: "Stores",
    href: "/stores",
    icon: Store,
    countKey: "stores",
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
    if (item.href === "/stores" || item.href === "/plans") {
      return role === "SUPER_ADMIN";
    }
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

/**
 * Which section is expanded.
 *
 * `undefined` means no one has chosen yet, so the route decides; a title
 * means that section is open; `null` means the user collapsed everything.
 */
type OpenMenu = string | null | undefined;

// Same override classes as the section-expand chevron and the quick-add
// "+" — every small sidebar control shares one look, not a look per section.
const NAV_CONTROL_CLASS = "text-white/70 hover:bg-card/10 hover:text-white";

/**
 * "Customers - 3" — inline right after the label, not a right-aligned
 * badge. Plain text rather than a pill: it sits in the same flex row as the
 * icon/title with normal document flow, so it never has to fight the
 * absolutely-positioned chevron/quick-add "+" for the same right-edge slot
 * the way a SidebarMenuBadge would.
 */
function NavCount({ count }: { count?: number }) {
  // A brand-new store's empty lists don't need "- 0" cluttering every item —
  // this exists to answer "how many," and zero isn't news.
  if (!count) return null;
  return (
    <span className="font-normal text-white/50">
      {" "}
      - {count > 999 ? "999+" : count}
    </span>
  );
}

function SidebarNavItem({
  item,
  pathname,
  openMenu,
  setOpenMenu,
  counts,
}: {
  item: NavItem;
  pathname: string;
  openMenu: OpenMenu;
  setOpenMenu: (next: OpenMenu) => void;
  counts: SidebarCounts;
}) {
  const Icon = item.icon;
  const isActive = isNavItemActive(pathname, item.href);
  const hasSubItems = "items" in item && item.items;
  const isSubItemActive =
    hasSubItems && item.items!.some((subItem) => pathname === subItem.href);

  // What the route alone would open. `isActive` as well as `isSubItemActive`,
  // because landing on a section's own page (/inventory) matches no sub-item
  // and would otherwise leave the section you just opened shut.
  const routeOpen = Boolean(isActive || isSubItemActive);

  // The open section is held by the sidebar, not by each item, which is what
  // makes this an accordion: only one title can match at a time, so opening
  // one closes whichever was open.
  const open = openMenu === undefined ? routeOpen : openMenu === item.title;

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
            <span>
              {item.title}
              {item.countKey && <NavCount count={counts[item.countKey]} />}
            </span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      {/* Navigating to the section opens it; it never closes it, so landing
          on a sub-page doesn't fight the chevron. */}
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={item.title}
        onClick={() => setOpenMenu(item.title)}
        className={ACTIVE_NAV_CLASS}
      >
        <Link href={item.href}>
          <Icon className="h-4 w-4" />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>

      {/* A real button beside the link rather than inside it: the chevron
          expands and collapses, and must not navigate. Nesting it in the
          <Link> would also be invalid HTML. */}
      <SidebarMenuAction
        // Closing sets null rather than undefined: undefined would fall back
        // to the route and immediately re-open the section you are inside.
        onClick={() => setOpenMenu(open ? null : item.title)}
        aria-expanded={open}
        aria-label={`${open ? "Collapse" : "Expand"} ${item.title}`}
        className={NAV_CONTROL_CLASS}
      >
        <ChevronRight
          className={`h-4 w-4 shrink-0 transition-transform ${
            open ? "rotate-90" : ""
          }`}
        />
      </SidebarMenuAction>

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
                  <span>
                    {subItem.title}
                    {subItem.countKey && <NavCount count={counts[subItem.countKey]} />}
                  </span>
                </Link>
              </SidebarMenuSubButton>

              {/* Same override classes as the section-level chevron above —
                  "+" icons must look and behave identically everywhere they
                  appear, not just within one section. */}
              {subItem.quickAddHref && (
                <SidebarMenuAction asChild className={NAV_CONTROL_CLASS}>
                  <Link href={subItem.quickAddHref} aria-label={`Add new ${subItem.title}`}>
                    <Plus className="h-4 w-4" />
                  </Link>
                </SidebarMenuAction>
              )}
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
  counts?: SidebarCounts;
};

const EMPTY_COUNTS: SidebarCounts = {
  customers: 0,
  vendors: 0,
  products: 0,
  stock: 0,
  purchases: 0,
  karigars: 0,
  quotations: 0,
  invoices: 0,
  kachaInvoices: 0,
  creditNotes: 0,
  users: 0,
  stores: 0,
};

export function AppSidebar({ storeName, storeLogoUrl, counts = EMPTY_COUNTS }: AppSidebarProps = {}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const navItems = getNavForRole(role, session?.user?.permissions);

  const [openMenu, setOpenMenu] = useState<OpenMenu>(undefined);

  // Hand control back to the route on every navigation, so the section you
  // land in opens and the rest close. Without this, a section expanded by
  // hand would stay expanded while you worked somewhere else entirely.
  useEffect(() => {
    setOpenMenu(undefined);
  }, [pathname]);
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
            <h2 className="truncate font-heading font-semibold">{storeName || APP_NAME}</h2>
            <p className="text-xs text-muted-foreground">{APP_NAME}</p>
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
                <SidebarNavItem
                  key={item.title}
                  item={item}
                  pathname={pathname}
                  openMenu={openMenu}
                  setOpenMenu={setOpenMenu}
                  counts={counts}
                />
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

                {/* The owner's own subscription. Not shown to a Super Admin,
                    who reaches every store's ledger through Stores and has no
                    single "my plan" of their own. */}
                {role === "ADMIN" && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isNavItemActive(pathname, "/my-plan")}
                      tooltip="Plan & Billing"
                      className={ACTIVE_NAV_CLASS}
                    >
                      <Link href="/my-plan">
                        <CreditCard className="h-4 w-4" />
                        <span>Plan &amp; Billing</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
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
