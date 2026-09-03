import type { Metadata } from "next";

import {
  getStores,
  getPlatformGoldInventory,
  type StoreSortBy,
  type SortOrder,
} from "@/lib/actions/store-actions";
import { getPlans } from "@/lib/actions/plan-actions";
import { getStorePlanOverviews } from "@/lib/actions/store-plan-actions";
import { StoresClient } from "@/components/stores/stores-client";

export const metadata: Metadata = {
  title: "Stores",
};

type StoresPageProps = {
  searchParams?: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    sortBy?: StoreSortBy;
    sortOrder?: SortOrder;
  }>;
};

export const dynamic = "force-dynamic";

export default async function StoresPage({ searchParams }: StoresPageProps) {
  const params = (await searchParams) ?? {};

  const page = Number(params.page || 1);
  const pageSize = Number(params.pageSize || 10);
  const search = params.search || "";
  const sortBy = params.sortBy || "createdAt";
  const sortOrder = params.sortOrder || "desc";

  const [{ stores, pagination }, goldSummary, plans] = await Promise.all([
    getStores({ page, pageSize, search, sortBy, sortOrder }),
    getPlatformGoldInventory(),
    getPlans({ activeOnly: true }),
  ]);

  // Fetched for this page of rows only, in one query rather than per row —
  // the hover card needs it ready before the pointer arrives, so it cannot
  // be loaded on demand without a visible stall.
  const planOverviews = await getStorePlanOverviews(stores.map((s) => s.id));

  return (
    <StoresClient
      stores={stores}
      pagination={pagination}
      goldSummary={goldSummary}
      plans={plans}
      planOverviews={planOverviews}
    />
  );
}
