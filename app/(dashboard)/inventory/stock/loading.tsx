// app/(dashboard)/inventory/stock/loading.tsx

export default function StockLoading() {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="flex flex-col items-center gap-3">

        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />

        <p className="text-sm text-muted-foreground">
          Loading stock...
        </p>

      </div>
    </div>
  );
}