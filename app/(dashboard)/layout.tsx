import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";

import { authOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/prisma";
import {
  getEffectiveStoreId,
  getUserStoreMemberships,
} from "@/lib/store-context";
import { getSidebarCounts } from "@/lib/actions/sidebar-actions";

import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { TopBar } from "@/components/dashboard/top-bar";

import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const isSuperAdmin = session.user.role === UserRole.SUPER_ADMIN;

  // Store Owner Authorization: a Super Admin no longer reaches every store
  // unconditionally — getUserStoreMemberships() returns exactly the stores
  // they've redeemed a still-valid Collaboration Code for (same shape as a
  // real membership list), so this switcher is built identically for
  // everyone now. Restoring an archived store is a Platform Stores console
  // action (StoreStatusToggle et al.), not something that ever went through
  // this switcher's cookie, so excluding archived stores here (same as any
  // other member) doesn't block that.
  const [memberships, activeStoreId] = await Promise.all([
    getUserStoreMemberships(),
    getEffectiveStoreId(),
  ]);

  const stores = memberships.map((m) => ({
    id: m.storeId,
    name: m.storeName,
    code: m.storeCode,
    isArchived: false,
  }));

  // Brand the sidebar with the store actually being worked in, not the one
  // on the User row — those differ the moment someone switches.
  const [storeBranding, sidebarCounts] = await Promise.all([
    activeStoreId
      ? prisma.store.findUnique({
          where: { id: activeStoreId },
          select: { name: true, businessSettings: { select: { logoUrl: true } } },
        })
      : Promise.resolve(null),
    getSidebarCounts(activeStoreId, session.user.role),
  ]);

  return (
    <SidebarProvider>
      <AppSidebar
        storeName={storeBranding?.name}
        storeLogoUrl={storeBranding?.businessSettings?.logoUrl}
        counts={sidebarCounts}
      />

      <SidebarInset>
        <TopBar
          stores={stores}
          activeStoreId={activeStoreId}
          canSwitchStores={isSuperAdmin || stores.length > 1}
        />

        <main className="flex min-w-0 flex-1 flex-col bg-slate-50 p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}