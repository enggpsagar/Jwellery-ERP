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
import { hasModuleAccess } from "@/lib/roles";
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

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md md:px-6">
      <SidebarTrigger className="text-muted-foreground" />

      <Separator orientation="vertical" className="h-6" />

      <GlobalSearch />

      {/* Shown to a Super Admin, and to any user who belongs to more than
          one store. A single-store user has nothing to choose. */}
      {canSwitchStores && stores.length > 0 && (
        <StoreSwitcher stores={stores} activeStoreId={activeStoreId} />
      )}

      <div className="ml-auto flex items-center gap-2">
        {canAccessBilling && (
          <Button size="sm" asChild>
            <Link href="/billing/new">
              <Plus className="mr-1 h-4 w-4" />
              New Invoice
            </Link>
          </Button>
        )}

        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md px-2 hover:bg-accent">
            <Avatar className="h-7 w-7">
              <AvatarFallback
                className="text-xs font-semibold"
                style={avatar.style}
              >
                {userInitials}
              </AvatarFallback>
            </Avatar>

            <span className="hidden text-sm font-medium sm:inline">
              {userName}
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

              <DropdownMenuItem asChild>
                <Link href="/settings">Store Settings</Link>
              </DropdownMenuItem>

              {canAccessBilling && (
                <DropdownMenuItem asChild>
                  <Link href="/billing">Billing</Link>
                </DropdownMenuItem>
              )}
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
