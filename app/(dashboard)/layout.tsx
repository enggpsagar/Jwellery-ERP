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

  // Super Admin reaches every store; everyone else reaches the stores they
  // hold a membership in. Someone who works across two shops now gets the
  // same switcher, rather than being pinned to whichever store their User
  // row happened to name.
  const [allStores, memberships, activeStoreId] = await Promise.all([
    isSuperAdmin
      ? // Archived stores are included on purpose. A Super Admin has to be
        // able to open a store to decide whether to restore it, and
        // filtering on isActive made archived shops vanish from the switcher
        // with no way back in. Their own users are still blocked at sign-in.
        prisma.store.findMany({
          orderBy: [{ isActive: "desc" }, { name: "asc" }],
          select: { id: true, name: true, code: true, isActive: true },
        })
      : Promise.resolve([]),
    isSuperAdmin ? Promise.resolve([]) : getUserStoreMemberships(),
    getEffectiveStoreId(),
  ]);

  const stores = isSuperAdmin
    ? allStores.map((store) => ({
        id: store.id,
        name: store.name,
        code: store.code,
        // Labelled rather than hidden, so switching into a closed shop is a
        // deliberate act rather than a surprise.
        isArchived: !store.isActive,
      }))
    : memberships.map((m) => ({
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