// FILE PATH: app/(dashboard)/karigars/[id]/receive-items/[jobId]/page.tsx

import { notFound } from "next/navigation";

import { getKarigarById } from "@/lib/actions/karigar-actions";
import { getPurityFineness } from "@/lib/actions/purity-actions";
import { getInventoryStockFormProducts } from "@/lib/actions/inventory/stock-actions";
import { getStoreMetals } from "@/lib/actions/taxonomy-actions";
import { getStoreLocations } from "@/lib/actions/store-location-actions";
import { prisma } from "@/lib/prisma";
import { requireStoreScope } from "@/lib/store-context";

import { PageBackHeader } from "@/components/shared/page-back-header";
import { ReceiveItemsForm } from "@/components/karigars/receive-items-form";

type Props = {
  params: Promise<{ id: string; jobId: string }>;
};

function formatDate(date: Date | null) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default async function ReceiveItemsPage({ params }: Props) {
  const { id, jobId } = await params;

  const karigar = await getKarigarById(id);
  if (!karigar) {
    notFound();
  }

  const storeId = await requireStoreScope();

  const job = await prisma.karigarJob.findFirst({
    where: { id: jobId, karigarId: id, storeId },
  });

  if (!job || job.status === "received") {
    notFound();
  }

  const [finenessRows, products, metals, locations] = await Promise.all([
    getPurityFineness(),
    getInventoryStockFormProducts(),
    getStoreMetals(),
    getStoreLocations(),
  ]);

  const fineness = Object.fromEntries(
    finenessRows.map((row) => [row.purity, row.finenessPercent]),
  );

  // ProductSelect's shared ProductOption type expects category/ornamentType/metalType
  // as flat display strings, not the relation objects getInventoryStockFormProducts()
  // now returns.
  const productSelectOptions = products.map((product) => ({
    id: product.id,
    productCode: product.productCode,
    name: product.name,
    category: product.category?.name ?? null,
    ornamentType: product.categoryType?.name ?? null,
    metalType: product.metalType?.name ?? null,
    defaultPurity: product.defaultPurity ?? null,
    isActive: product.isActive,
  }));

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={`Receive Items — ${karigar.name}`}
        description={`Job ${job.jobNumber ?? job.id} · Issued ${formatDate(job.issueDate)} · ${
          job.issueWeight ? Number(job.issueWeight) : 0
        }g ${job.issuePurity ?? ""} (${
          job.issueFineWeight ? Number(job.issueFineWeight).toFixed(3) : "0.000"
        }g fine)`}
        backHref={`/karigars/${id}`}
        backLabel="Back to Karigar"
      />

      <ReceiveItemsForm
        karigarId={id}
        jobId={job.id}
        products={productSelectOptions}
        fineness={fineness}
        metals={metals}
        locations={locations}
      />
    </main>
  );
}
