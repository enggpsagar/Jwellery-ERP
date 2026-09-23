"use server";

import { UserRole } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";

/**
 * Every query here is scoped by karigarId, not storeId — this file is the
 * self-service surface a KARIGAR-role user hits directly (My Jobs), so each
 * function re-derives the caller's own karigarId from the session rather
 * than trusting an id passed in, the same defense-in-depth convention as
 * getSupportTicketForAdmin re-checking role server-side. A karigar can
 * never see another artisan's job by guessing/editing an id.
 */
async function requireKarigarId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user || user.role !== UserRole.KARIGAR || !user.karigarId) {
    throw new Error("Not authorized");
  }
  return user.karigarId;
}

export type MyJobRow = {
  id: string;
  jobNumber: string | null;
  issueDate: string;
  expectedDate: string | null;
  issueWeight: number | null;
  receiveWeight: number | null;
  labourCharge: number;
  status: string;
  itemLabel: string | null;
};

export async function getMyJobs(): Promise<MyJobRow[]> {
  const karigarId = await requireKarigarId();

  const jobs = await prisma.karigarJob.findMany({
    where: { karigarId },
    orderBy: { issueDate: "desc" },
    include: {
      inventoryStock: {
        select: { stockCode: true, product: { select: { name: true } } },
      },
    },
  });

  return jobs.map((job) => ({
    id: job.id,
    jobNumber: job.jobNumber,
    issueDate: job.issueDate.toISOString(),
    expectedDate: job.expectedDate?.toISOString() ?? null,
    issueWeight: job.issueWeight ? Number(job.issueWeight) : null,
    receiveWeight: job.receiveWeight ? Number(job.receiveWeight) : null,
    labourCharge: Number(job.labourCharge),
    status: job.status,
    itemLabel: job.inventoryStock
      ? `${job.inventoryStock.product.name} (${job.inventoryStock.stockCode})`
      : null,
  }));
}

export type MyJobDetailItem = {
  id: string;
  itemName: string;
  quantity: number;
  estimatedWeight: number | null;
  purityLabel: string | null;
  designNotes: string | null;
};

export type MyJobReceiptItem = {
  id: string;
  itemName: string;
  purityLabel: string | null;
  quantity: number;
  grossWeight: number | null;
  netWeight: number | null;
  fineWeight: number;
};

export type MyJobLedgerRow = {
  id: string;
  dateISO: string;
  type: "CREDIT" | "DEBIT";
  description: string;
  metalWeightFine: number | null;
  metalName: string | null;
  amount: number;
};

export type MyJobDetail = {
  id: string;
  jobNumber: string | null;
  status: string;
  issueDate: string;
  expectedDate: string | null;
  receivedDate: string | null;
  locationName: string | null;
  metalName: string | null;
  issuePurityLabel: string | null;
  issueWeight: number | null;
  issueFineWeight: number | null;
  receiveWeight: number | null;
  receiveFineWeight: number | null;
  labourCharge: number;
  notes: string | null;
  finishedPieceLabel: string | null;
  draftOrder: { orderNumber: string; items: MyJobDetailItem[] } | null;
  receiptItems: MyJobReceiptItem[];
  ledgerEntries: MyJobLedgerRow[];
};

export async function getMyJobById(id: string): Promise<MyJobDetail | null> {
  const karigarId = await requireKarigarId();

  const job = await prisma.karigarJob.findFirst({
    where: { id, karigarId },
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

  if (!job) return null;

  // LedgerEntry has no karigarJobId FK — every job-bound Issue/Receive/
  // Labour Charge entry embeds "Job <jobNumber>" in its own description
  // instead (see issueMaterialToKarigar/sendDraftOrderToKarigar/
  // receiveItemsFromKarigar), so that's the only way to find a job's own
  // slice of this karigar's ledger. recordMaterialReceiptFromKarigar
  // (against-outstanding-balance receipts with no job) deliberately never
  // includes a job number, so it's correctly excluded here.
  const ledgerEntries = job.jobNumber
    ? await prisma.ledgerEntry.findMany({
        where: { karigarId, description: { contains: job.jobNumber } },
        orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
        include: { metalType: { select: { name: true } } },
      })
    : [];

  return {
    id: job.id,
    jobNumber: job.jobNumber,
    status: job.status,
    issueDate: job.issueDate.toISOString(),
    expectedDate: job.expectedDate?.toISOString() ?? null,
    receivedDate: job.receivedDate?.toISOString() ?? null,
    locationName: job.location?.name ?? null,
    metalName: job.metalType?.name ?? null,
    issuePurityLabel: job.issuePurityLabel,
    issueWeight: job.issueWeight ? Number(job.issueWeight) : null,
    issueFineWeight: job.issueFineWeight ? Number(job.issueFineWeight) : null,
    receiveWeight: job.receiveWeight ? Number(job.receiveWeight) : null,
    receiveFineWeight: job.receiveFineWeight ? Number(job.receiveFineWeight) : null,
    labourCharge: Number(job.labourCharge),
    notes: job.notes,
    finishedPieceLabel: job.inventoryStock
      ? `${job.inventoryStock.product.name} (${job.inventoryStock.stockCode})`
      : null,
    draftOrder: job.draftOrder
      ? {
          orderNumber: job.draftOrder.orderNumber,
          items: job.draftOrder.items.map((item) => ({
            id: item.id,
            itemName: item.itemName,
            quantity: item.quantity,
            estimatedWeight: item.estimatedWeight ? Number(item.estimatedWeight) : null,
            purityLabel: item.purityLabel,
            designNotes: item.designNotes,
          })),
        }
      : null,
    receiptItems: job.receiptItems.map((item) => ({
      id: item.id,
      itemName: item.itemName,
      purityLabel: item.purityLabel,
      quantity: item.quantity,
      grossWeight: item.grossWeight ? Number(item.grossWeight) : null,
      netWeight: item.netWeight ? Number(item.netWeight) : null,
      fineWeight: Number(item.fineWeight),
    })),
    ledgerEntries: ledgerEntries.map((entry) => ({
      id: entry.id,
      dateISO: entry.entryDate.toISOString(),
      type: entry.type as "CREDIT" | "DEBIT",
      description: entry.description ?? "",
      metalWeightFine: entry.metalWeightFine ? Number(entry.metalWeightFine) : null,
      metalName: entry.metalType?.name ?? null,
      amount: Number(entry.amount ?? 0),
    })),
  };
}
