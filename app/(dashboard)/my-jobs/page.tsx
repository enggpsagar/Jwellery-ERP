import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "My Jobs",
};

function formatDate(date: Date | null) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default async function MyJobsPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== UserRole.KARIGAR) {
    redirect("/dashboard");
  }

  if (!user.karigarId) {
    return (
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">My Jobs</h1>
        <p className="text-muted-foreground">
          Your account isn&apos;t linked to a karigar profile yet. Ask your
          admin to link it from the Users page.
        </p>
      </div>
    );
  }

  const jobs = await prisma.karigarJob.findMany({
    where: { karigarId: user.karigarId },
    orderBy: { issueDate: "desc" },
    include: {
      inventoryStock: {
        select: { stockCode: true, product: { select: { name: true } } },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">My Jobs</h1>
        <p className="text-muted-foreground">
          Jobs issued to you — nothing else in this store is visible from
          your account.
        </p>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job No.</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead>Expected</TableHead>
              <TableHead>Issue Weight</TableHead>
              <TableHead>Received Weight</TableHead>
              <TableHead>Labour Charge</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  No jobs assigned to you yet.
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>{job.jobNumber ?? "-"}</TableCell>
                  <TableCell>
                    {job.inventoryStock
                      ? `${job.inventoryStock.product.name} (${job.inventoryStock.stockCode})`
                      : "-"}
                  </TableCell>
                  <TableCell>{formatDate(job.issueDate)}</TableCell>
                  <TableCell>{formatDate(job.expectedDate)}</TableCell>
                  <TableCell>
                    {job.issueWeight ? `${Number(job.issueWeight)} g` : "-"}
                  </TableCell>
                  <TableCell>
                    {job.receiveWeight ? `${Number(job.receiveWeight)} g` : "-"}
                  </TableCell>
                  <TableCell>₹ {Number(job.labourCharge).toLocaleString("en-IN")}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{job.status}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
