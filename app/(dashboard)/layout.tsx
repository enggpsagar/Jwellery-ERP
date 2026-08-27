import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";

import { authOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/prisma";
import {
  getEffectiveStoreId,
  getUserStoreMemberships,
} from "@/lib/store-context";

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
      ? prisma.store.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, code: true },
        })
      : Promise.resolve([]),
    isSuperAdmin ? Promise.resolve([]) : getUserStoreMemberships(),
    getEffectiveStoreId(),
  ]);

  const stores = isSuperAdmin
    ? allStores
    : memberships.map((m) => ({
        id: m.storeId,
        name: m.storeName,
        code: m.storeCode,
      }));

  // Brand the sidebar with the store actually being worked in, not the one
  // on the User row — those differ the moment someone switches.
  const storeBranding = activeStoreId
    ? await prisma.store.findUnique({
        where: { id: activeStoreId },
        select: { name: true, businessSettings: { select: { logoUrl: true } } },
      })
    : null;

  return (
    <SidebarProvider>
      <AppSidebar
        storeName={storeBranding?.name}
        storeLogoUrl={storeBranding?.businessSettings?.logoUrl}
      />

      <SidebarInset>
        <TopBar
          stores={stores}
          activeStoreId={activeStoreId}
          canSwitchStores={isSuperAdmin || stores.length > 1}
        />

        <main className="flex flex-1 flex-col bg-slate-50 p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}