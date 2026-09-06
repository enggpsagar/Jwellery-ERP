import { Loader } from "@/components/ui/loader"

export default function SupportTicketsLoading() {
  return (
    <main className="space-y-6 p-6">
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader className="h-24 w-24" />
          <p className="text-sm text-muted-foreground">Loading support tickets...</p>
        </div>
      </div>
    </main>
  )
}
