import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { UserRole } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth/auth";
import { getMyJobById } from "@/lib/actions/my-jobs-actions";

import { PageBackHeader } from "@/components/shared/page-back-header";
import { MyJobDetailContent } from "@/components/karigars/my-job-detail-content";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Job Details",
};

type MyJobDetailPageProps = {
  params: Promise<{ id: string }>;
};

/**
 * Standalone full-page view of a single job — same content as the inline
 * detail panel on /my-jobs (MyJobDetailContent), for direct linking, same
 * convention as /orders/[id] coexisting with the /orders master-detail page.
 */
export default async function MyJobDetailPage({ params }: MyJobDetailPageProps) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user || user.role !== UserRole.KARIGAR || !user.karigarId) {
    redirect("/dashboard");
  }

  const job = await getMyJobById(id);
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

      <MyJobDetailContent job={job} />
    </div>
  );
}
