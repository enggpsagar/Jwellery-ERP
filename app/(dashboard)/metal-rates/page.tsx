import { prisma } from "@/lib/prisma";
import { MetalRatesTable } from "@/components/metal-rates/metal-rates-table";
import { PageBackHeader } from "@/components/shared/page-back-header";

export default async function MetalRatesPage() {
  const rates = await prisma.metalRate.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: 100,
  });

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
        description="View historical Gold & Silver prices, trends and export reports."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
      />

      <MetalRatesTable data={formattedRates} />
    </main>
  );
}
