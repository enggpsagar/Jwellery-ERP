import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";
import { MetalRatesTable } from "@/components/metal-rates/metal-rates-table";
import { SellingRateHistory } from "@/components/metal-rates/selling-rate-history";
import { getSellingRateHistory } from "@/lib/selling-rates";
import { PageBackHeader } from "@/components/shared/page-back-header";
import { requireStoreScope } from "@/lib/store-context";

export const metadata: Metadata = {
  title: "Metal Rates",
};

export default async function MetalRatesPage() {
  const storeId = await requireStoreScope();

  const [rates, sellingHistory] = await Promise.all([
    prisma.metalRate.findMany({
      where: {
        storeId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    }),
    getSellingRateHistory(storeId),
  ]);

  const formattedRates = rates.map((rate) => ({
    id: rate.id,
    date: rate.createdAt.toISOString(),
    gold24k: Number(rate.gold24k),
    gold22k: Number(rate.gold22k),
    gold18k: Number(rate.gold18k),
    silver: Number(rate.silver),
    unit: rate.unit,
  }));

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <PageBackHeader
        title="Metal Rate History"
        description="Your own selling rates, and the market Gold & Silver prices fetched daily."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
      />

      <SellingRateHistory rows={sellingHistory} />

      <MetalRatesTable data={formattedRates} />
    </main>
  );
}
