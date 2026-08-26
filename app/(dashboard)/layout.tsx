import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";

import { authOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/prisma";
import { getEffectiveStoreId } from "@/lib/store-context";

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

  const [stores, activeStoreId, storeBranding] = await Promise.all([
    isSuperAdmin
      ? prisma.store.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, code: true },
        })
      : Promise.resolve([]),
    isSuperAdmin ? getEffectiveStoreId() : Promise.resolve(null),
    !isSuperAdmin && session.user.storeId
      ? prisma.store.findUnique({
          where: { id: session.user.storeId },
          select: { name: true, businessSettings: { select: { logoUrl: true } } },
        })
      : Promise.resolve(null),
  ]);

  return (
    <SidebarProvider>
      <AppSidebar
        storeName={storeBranding?.name}
        storeLogoUrl={storeBranding?.businessSettings?.logoUrl}
      />

      <SidebarInset>
        <TopBar stores={stores} activeStoreId={activeStoreId} />

        <main className="flex flex-1 flex-col bg-slate-50 p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}