// app/(dashboard)/inventory/stock/loading.tsx

import { Loader } from "@/components/ui/loader";

export default function StockLoading() {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="flex flex-col items-center gap-3">

        <Loader className="h-8 w-8" />

        <p className="text-sm text-muted-foreground">
          Loading stock...
        </p>

      </div>
    </div>
  );
}