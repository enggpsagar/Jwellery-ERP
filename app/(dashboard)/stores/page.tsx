import {
  getStores,
  getPlatformGoldInventory,
  type StoreSortBy,
  type SortOrder,
} from "@/lib/actions/store-actions";
import { getPlans } from "@/lib/actions/plan-actions";
import { StoresClient } from "@/components/stores/stores-client";

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

  return (
    <StoresClient
      stores={stores}
      pagination={pagination}
      goldSummary={goldSummary}
      plans={plans}
    />
  );
}
