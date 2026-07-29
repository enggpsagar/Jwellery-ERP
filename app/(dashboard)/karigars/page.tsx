import Link from "next/link";

import { getKarigars } from "@/lib/actions/karigar-actions";

import { KarigarTable } from "@/components/karigars/karigar-table";
import { PageBackHeader } from "@/components/shared/page-back-header";
import { Button } from "@/components/ui/button";

export default async function KarigarsPage() {
  const { karigars } = await getKarigars();

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Karigars"
        description="Manage jewellery artisans and their job records."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
        action={
          <Link href="/karigars/new">
            <Button>Add Karigar</Button>
          </Link>
        }
      />

      <KarigarTable karigars={karigars} />
    </main>
  );
}
