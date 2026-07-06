export default function CustomersLoading() {
  return (
    <main className="space-y-6 p-6">
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-black" />
          <p className="text-sm text-muted-foreground">Loading customers...</p>
        </div>
      </div>
    </main>
  )
}