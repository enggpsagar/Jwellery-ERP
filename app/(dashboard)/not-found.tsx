import Link from "next/link";
import { FileQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function DashboardNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
        <FileQuestion className="h-6 w-6 text-amber-600" />
      </div>

      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Page not found</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          This page doesn&apos;t exist yet or may have moved.
        </p>
      </div>

      <div className="flex gap-3 pt-2">
        <Link href="/dashboard">
          <Button>Back to Dashboard</Button>
        </Link>
      </div>
    </div>
  );
}