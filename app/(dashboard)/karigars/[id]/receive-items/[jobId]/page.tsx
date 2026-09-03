// FILE PATH: app/(dashboard)/karigars/[id]/receive-items/[jobId]/page.tsx

import type { Metadata } from "next";
import { cache } from "react";
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

const getKarigar = cache(getKarigarById);

// Only the karigar's name is used here, not the job number — the job lookup
// below is a raw prisma call scoped by requireStoreScope(), which can throw
// (e.g. no store selected), and generateMetadata must never throw. Reusing
// getKarigarById (already a plain, non-throwing action) keeps the title
// specific without duplicating that store-scoped query and its failure mode.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params;
    const karigar = await getKarigar(id);
    return { title: karigar ? `Receive Items — ${karigar.name}` : "Receive Items" };
  } catch {
    return { title: "Receive Items" };
  }
}

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

  const karigar = await getKarigar(id);
  if (!karigar) {
    notFound();
  }

  const storeId = await requireStoreScope();

  const job = await prisma.karigarJob.findFirst({
    where: { id: jobId, karigarId: id, storeId },
    include: { metalType: { select: { id: true, name: true } } },
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
        }g fine)${
          job.issueWeight && Number(job.receiveWeight ?? 0) > 0
            ? ` · ${Number(job.receiveWeight).toFixed(3)}g already received, ${Math.max(
                0,
                Number(job.issueWeight) - Number(job.receiveWeight),
              ).toFixed(3)}g remaining`
            : ""
        }`}
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
        jobMetalTypeId={job.metalTypeId}
        jobMetalTypeName={job.metalType?.name ?? null}
      />
    </main>
  );
}
