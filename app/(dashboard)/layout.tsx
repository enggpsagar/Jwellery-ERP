import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { UserRole } from "@prisma/client";
import { ShieldCheck } from "lucide-react";

import { authOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/prisma";
import {
  getEffectiveStoreId,
  getUserStoreMemberships,
} from "@/lib/store-context";
import { getSidebarCounts } from "@/lib/actions/sidebar-actions";

import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { TopBar } from "@/components/dashboard/top-bar";

import { Button } from "@/components/ui/button";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";

/**
 * Every dashboard page's own server actions eventually call
 * requireStoreScope(), which throws once there's no store to resolve to —
 * a Super Admin who hasn't redeemed any Collaboration Code yet lands here
 * every time (the common case right after this feature shipped, since no
 * one has redeemed anything). Without this, that throw surfaced as the
 * generic error.tsx boundary ("Something went wrong") telling them to
 * "choose a store from the switcher" — which is impossible, since the
 * switcher has zero stores to offer when stores.length === 0. This renders
 * instead of {children} in exactly that case, with the one place they
 * CAN actually act: the Platform Stores console's own "Enter code" button,
 * which (deliberately) never depends on requireStoreScope().
 */
// Platform-level routes a Super Admin needs regardless of store access —
// none of them call requireStoreScope(), so they render fine on their own;
// this list only exists so the layout doesn't ALSO intercept them with the
// notice below, which would make /stores (the actual way out) unreachable.
const STORE_EXEMPT_PREFIXES = ["/stores", "/plans", "/profile", "/support-tickets", "/contact-faq"];

function NoStoreAccessNotice() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
        <ShieldCheck className="h-6 w-6 text-amber-600" />
      </div>

      <div className="space-y-1">
        <h2 className="text-lg font-semibold">
          Please provide the collaboration code to access this store
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          As a Super Admin, you no longer reach a store&apos;s data by
          default. Ask the store owner for their Collaboration Code (Settings
          &gt; Collaboration on their end), then redeem it from the Platform
          Stores console.
        </p>
      </div>

      <Link href="/stores">
        <Button>Go to Stores</Button>
      </Link>
    </div>
  );
}

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

  const pathname = (await headers()).get("x-pathname") ?? "";
  const isStoreExemptRoute = STORE_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));

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
          {isSuperAdmin && stores.length === 0 && !isStoreExemptRoute ? (
            <NoStoreAccessNotice />
          ) : (
            children
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}