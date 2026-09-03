"use client";

import { Plus, ChevronDown, LogOut } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { hasModuleAccess, ROLE_LABELS } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { avatarColor, initialsOf } from "@/lib/avatar-color";
import { GlobalSearch } from "@/components/dashboard/global-search";
import { StoreSwitcher } from "@/components/dashboard/store-switcher";
import { NotificationBell } from "@/components/dashboard/notification-bell";

type StoreOption = {
  id: string;
  name: string;
  code: string;
};

type TopBarProps = {
  stores?: StoreOption[];
  activeStoreId?: string | null;
  /** Super Admin, or anyone holding more than one store membership. */
  canSwitchStores?: boolean;
};

export function TopBar({
  stores = [],
  activeStoreId = null,
  canSwitchStores = false,
}: TopBarProps) {
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.role === "SUPER_ADMIN";
  // Settings is Admin/Super Admin only (enforced in middleware.ts) — hiding
  // the link for every other role matches the sidebar's own `showSettings`
  // gate (components/dashboard/app-sidebar.tsx) instead of showing a link
  // that just bounces Karigar/Staff/Manager back to /dashboard.
  const canAccessSettings =
    session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN";
  // A user whose module access doesn't cover Billing gets no billing entry
  // points in the header — middleware would bounce them off /billing anyway.
  const canAccessBilling = hasModuleAccess("billing", {
    role: session?.user?.role,
    permissions: session?.user?.permissions,
  });
  const userName = session?.user?.name ?? "User";
  const userInitials = initialsOf(userName);
  // Same colour for the same person everywhere, derived from the name.
  const avatar = avatarColor(userName);
  const roleLabel = session?.user?.role
    ? ROLE_LABELS[session.user.role as keyof typeof ROLE_LABELS]
    : null;

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 px-4 md:px-6",
        "bg-background/85 backdrop-blur-md",
        // A gold hairline instead of the default grey rule. Drawn as a
        // gradient border-image so it fades at both ends rather than
        // stopping dead — a hard gold line across the full width reads as a
        // warning banner, which is not what a chrome divider should say.
        "border-b border-b-transparent [border-image:linear-gradient(90deg,transparent,color-mix(in_oklab,var(--chart-2)_38%,transparent),transparent)_1]",
      )}
    >
      <SidebarTrigger className="text-muted-foreground" />

      <Separator orientation="vertical" className="h-6" />

      <GlobalSearch />

      {/* Shown to a Super Admin, and to any user who belongs to more than
          one store. A single-store user has nothing to choose. */}
      {canSwitchStores && stores.length > 0 && (
        <StoreSwitcher stores={stores} activeStoreId={activeStoreId} />
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {canAccessBilling && (
          <Button
            size="sm"
            asChild
            // Gold, because this is the one action the bar exists to offer.
            // Deep enough (slot 2's dark step) to hold white text at 4.5:1 —
            // the light gold used for chart fills would not.
            className="bg-[var(--chart-2)] text-white shadow-sm hover:bg-[color-mix(in_oklab,var(--chart-2)_88%,black)]"
          >
            <Link href="/billing/new">
              <Plus className="mr-1 h-4 w-4" />
              New Invoice
            </Link>
          </Button>
        )}

        <NotificationBell />

        <Separator orientation="vertical" className="mx-1 h-6" />

        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-10 cursor-pointer items-center gap-2.5 rounded-full px-1.5 pr-2.5 transition-colors hover:bg-accent">
            <Avatar
              className="h-7 w-7 ring-1 ring-inset"
              // Ringed in the person's own hue, so the avatar reads as a
              // deliberate token rather than a grey circle.
              style={{
                // @ts-expect-error -- CSS custom property
                "--tw-ring-color": `color-mix(in oklab, ${avatar.hue} 35%, transparent)`,
              }}
            >
              <AvatarFallback
                className="text-xs font-semibold"
                style={avatar.style}
              >
                {userInitials}
              </AvatarFallback>
            </Avatar>

            {/* Name over role: two lines of hierarchy where there was one
                flat label, and the role answers "which hat am I wearing"
                for anyone who works across stores. */}
            <span className="hidden min-w-0 flex-col items-start leading-tight sm:flex">
              <span className="max-w-[9rem] truncate text-sm font-medium">
                {userName}
              </span>
              {roleLabel ? (
                <span className="text-[11px] text-muted-foreground">
                  {roleLabel}
                </span>
              ) : null}
            </span>

            <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:inline" />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/profile">Profile</Link>
              </DropdownMenuItem>

              {canAccessSettings ? (
                <DropdownMenuItem asChild>
                  <Link href="/settings">Store Settings</Link>
                </DropdownMenuItem>
              ) : null}

              <DropdownMenuItem asChild>
                <Link href="/contact-faq">Contact & FAQ</Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              variant="destructive"
              className="cursor-pointer"
              onClick={() =>
                signOut({
                  callbackUrl: "/login",
                })
              }
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
