import { Loader } from "@/components/ui/loader"

export default function VendorsLoading() {
  return (
    <main className="space-y-6 p-6">
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader className="h-10 w-10" />
          <p className="text-sm text-muted-foreground">Loading vendors...</p>
        </div>
      </div>
    </main>
  )
}
