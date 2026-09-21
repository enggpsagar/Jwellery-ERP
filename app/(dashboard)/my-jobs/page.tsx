import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth/auth";
import { getMyJobs } from "@/lib/actions/my-jobs-actions";
import { MyJobsClient } from "@/components/karigars/my-jobs-client";

export const metadata: Metadata = {
  title: "My Jobs",
};

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
          Your account isn&apos;t linked to an artisan profile yet. Ask your
          admin to link it from the Users page.
        </p>
      </div>
    );
  }

  const jobs = await getMyJobs();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">My Jobs</h1>
        <p className="text-muted-foreground">
          Jobs issued to you — nothing else in this store is visible from
          your account.
        </p>
      </div>

      <MyJobsClient jobs={jobs} />
    </div>
  );
}
