import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { customerActivity } from "@/lib/data"

export function ActivityFeed() {
  return (
    <Card className="gap-0">
      <CardHeader className="border-b [.border-b]:pb-5">
        <CardTitle>Recent Customer Activity</CardTitle>
        <CardDescription>Live updates across the store</CardDescription>
      </CardHeader>
      <CardContent className="pt-2">
        <ul className="flex flex-col">
          {customerActivity.map((a, i) => (
            <li
              key={i}
              className="flex items-start gap-3 border-b py-4 last:border-0"
            >
              <Avatar className="size-9 shrink-0">
                <AvatarFallback className="bg-accent text-accent-foreground text-xs font-medium">
                  {a.initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{a.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {a.time}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {a.action}
                </span>
                <span className="text-xs text-muted-foreground/80">
                  {a.detail}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
