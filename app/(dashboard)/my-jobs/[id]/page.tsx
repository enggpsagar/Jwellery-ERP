import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { UserRole } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";
import { formatShortDate } from "@/lib/utils";

import { PageBackHeader } from "@/components/shared/page-back-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Job Details",
};

type MyJobDetailPageProps = {
  params: Promise<{ id: string }>;
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value ?? "-"}</div>
    </div>
  );
}

/**
 * KARIGAR's single-job view — reachable only from their own My Jobs list.
 * Scoped by karigarId (not just id) so a karigar can never view another
 * artisan's job by guessing/editing the URL, same defense-in-depth
 * convention as getSupportTicketForAdmin re-checking role server-side.
 */
export default async function MyJobDetailPage({ params }: MyJobDetailPageProps) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user || user.role !== UserRole.KARIGAR || !user.karigarId) {
    redirect("/dashboard");
  }

  const job = await prisma.karigarJob.findFirst({
    where: { id, karigarId: user.karigarId },
    include: {
      inventoryStock: {
        select: { stockCode: true, product: { select: { name: true } } },
      },
      metalType: { select: { name: true } },
      location: { select: { name: true } },
      draftOrder: {
        include: {
          items: {
            select: {
              id: true,
              itemName: true,
              quantity: true,
              estimatedWeight: true,
              purityLabel: true,
              designNotes: true,
            },
          },
        },
      },
      receiptItems: {
        select: {
          id: true,
          itemName: true,
          purityLabel: true,
          quantity: true,
          grossWeight: true,
          netWeight: true,
          fineWeight: true,
        },
      },
    },
  });

  if (!job) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageBackHeader
        title={job.jobNumber ?? "Job"}
        description="Details of this job — issued to you for manufacturing."
        backHref="/my-jobs"
        backLabel="My Jobs"
        action={<Badge variant="outline">{job.status}</Badge>}
      />

      <Card>
        <CardHeader>
          <CardTitle>Job Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Issued" value={formatShortDate(job.issueDate)} />
          <Field label="Expected" value={job.expectedDate ? formatShortDate(job.expectedDate) : "-"} />
          <Field label="Received" value={job.receivedDate ? formatShortDate(job.receivedDate) : "-"} />
          <Field label="Location" value={job.location?.name} />
          <Field label="Metal" value={job.metalType?.name} />
          <Field label="Issue Purity" value={job.issuePurityLabel} />
          <Field label="Issue Weight" value={job.issueWeight ? `${Number(job.issueWeight)} g` : "-"} />
          <Field
            label="Issue Fine Weight"
            value={job.issueFineWeight ? `${Number(job.issueFineWeight)} g` : "-"}
          />
          <Field label="Received Weight" value={job.receiveWeight ? `${Number(job.receiveWeight)} g` : "-"} />
          <Field
            label="Received Fine Weight"
            value={job.receiveFineWeight ? `${Number(job.receiveFineWeight)} g` : "-"}
          />
          <Field label="Labour Charge" value={`₹ ${Number(job.labourCharge).toLocaleString("en-IN")}`} />
          <Field
            label="Finished Piece"
            value={
              job.inventoryStock
                ? `${job.inventoryStock.product.name} (${job.inventoryStock.stockCode})`
                : "-"
            }
          />
          {job.notes ? (
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="Notes" value={job.notes} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {job.draftOrder ? (
        <Card>
          <CardHeader>
            <CardTitle>What to Make — {job.draftOrder.orderNumber}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {job.draftOrder.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No items on this order.</p>
            ) : (
              job.draftOrder.items.map((item) => (
                <div key={item.id} className="rounded-lg border p-3 text-sm">
                  <div className="font-medium">{item.itemName}</div>
                  <div className="mt-1 grid grid-cols-2 gap-2 text-muted-foreground sm:grid-cols-4">
                    <span>Qty: {item.quantity}</span>
                    <span>
                      Weight: {item.estimatedWeight ? `${Number(item.estimatedWeight)} g` : "-"}
                    </span>
                    <span>Purity: {item.purityLabel ?? "-"}</span>
                  </div>
                  {item.designNotes ? (
                    <div className="mt-2 text-muted-foreground">{item.designNotes}</div>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      {job.receiptItems.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Received Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {job.receiptItems.map((item) => (
              <div key={item.id} className="rounded-lg border p-3 text-sm">
                <div className="font-medium">{item.itemName}</div>
                <div className="mt-1 grid grid-cols-2 gap-2 text-muted-foreground sm:grid-cols-4">
                  <span>Qty: {item.quantity}</span>
                  <span>Purity: {item.purityLabel ?? "-"}</span>
                  <span>Gross: {item.grossWeight ? `${Number(item.grossWeight)} g` : "-"}</span>
                  <span>Net: {item.netWeight ? `${Number(item.netWeight)} g` : "-"}</span>
                  <span>Fine: {Number(item.fineWeight)} g</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
