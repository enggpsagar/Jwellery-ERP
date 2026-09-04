"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Trash2 } from "lucide-react"

import { toggleReminderDone, deleteReminder, type CalendarEvent } from "@/lib/actions/calendar-actions"
import { useToast } from "@/components/providers/toast-provider"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

const TYPE_META: Record<CalendarEvent["type"], { label: string; dot: string }> = {
  INVOICE_DUE: { label: "Invoice Due", dot: "bg-blue-500" },
  QUOTATION_EXPIRY: { label: "Quotation Expiry", dot: "bg-amber-500" },
  KARIGAR_RETURN: { label: "Karigar Return", dot: "bg-purple-500" },
  PLAN_RENEWAL: { label: "Plan Renewal", dot: "bg-rose-500" },
  REMINDER: { label: "Reminder", dot: "bg-emerald-500" },
}

/** UTC date-only key, e.g. "2026-09-10" — matches how a plain <input type="date"> value round-trips through Date/toISOString, so grid days and event dates agree regardless of server/browser timezone. */
function dateKey(isoOrDate: string | Date): string {
  return (typeof isoOrDate === "string" ? isoOrDate : isoOrDate.toISOString()).slice(0, 10)
}

function buildMonthGrid(year: number, month: number): (string | null)[] {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()

  const cells: (string | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(dateKey(new Date(Date.UTC(year, month - 1, day))))
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

type CalendarViewProps = {
  year: number
  month: number
  events: CalendarEvent[]
}

export function CalendarView({ year, month, events }: CalendarViewProps) {
  const toast = useToast()
  const todayKey = dateKey(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(
    events.find((event) => dateKey(event.date) === todayKey) ? todayKey : null,
  )

  const cells = useMemo(() => buildMonthGrid(year, month), [year, month])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      const key = dateKey(event.date)
      const list = map.get(key) ?? []
      list.push(event)
      map.set(key, list)
    }
    return map
  }, [events])

  const selectedEvents = selectedDate ? eventsByDay.get(selectedDate) ?? [] : []

  async function handleToggle(event: CalendarEvent) {
    const id = event.id.replace(/^reminder-/, "")
    const result = await toggleReminderDone(id, !event.isDone)
    if (!result.success) toast.error(result.message || "Failed to update reminder")
  }

  async function handleDelete(event: CalendarEvent) {
    const id = event.id.replace(/^reminder-/, "")
    const result = await deleteReminder(id)
    if (result.success) toast.success(result.message || "Reminder deleted")
    else toast.error(result.message || "Failed to delete reminder")
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-xs font-medium">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="px-2 py-2 text-center">
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((key, index) => {
            if (!key) {
              return <div key={index} className="min-h-24 border-b border-r bg-muted/10" />
            }

            const dayEvents = eventsByDay.get(key) ?? []
            const hasOverdue = dayEvents.some((event) => event.isOverdue)
            const isToday = key === todayKey
            const isSelected = key === selectedDate

            const cell = (
              <button
                type="button"
                onClick={() => setSelectedDate(key)}
                className={cn(
                  "flex min-h-24 w-full flex-col items-start gap-1 border-b border-r p-2 text-left transition-colors hover:bg-accent",
                  isSelected && "bg-accent",
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                      isToday && "bg-primary text-primary-foreground",
                    )}
                  >
                    {Number(key.slice(8, 10))}
                  </span>

                  {/* A number, not just dots — dots alone cap out visually
                      at a handful before they stop reading as "how many,"
                      exactly the case a busy day with several reminders
                      needs to communicate clearly. */}
                  {dayEvents.length > 1 && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {dayEvents.length}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1">
                  {dayEvents.slice(0, 4).map((event) => (
                    <span
                      key={event.id}
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        TYPE_META[event.type].dot,
                        event.isDone && "opacity-40",
                      )}
                    />
                  ))}
                  {dayEvents.length > 4 && (
                    <span className="text-[10px] text-muted-foreground">+{dayEvents.length - 4}</span>
                  )}
                </div>

                {hasOverdue && (
                  <span className="text-[10px] font-medium text-red-600">Overdue</span>
                )}
              </button>
            )

            if (dayEvents.length === 0) {
              return <div key={index}>{cell}</div>
            }

            return (
              <Tooltip key={index}>
                <TooltipTrigger asChild>{cell}</TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-64 p-0">
                  <div className="max-h-64 w-64 space-y-2 overflow-y-auto p-2.5">
                    {dayEvents.map((event) => (
                      <div key={event.id} className="flex items-start gap-2">
                        <span
                          className={cn(
                            "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                            TYPE_META[event.type].dot,
                          )}
                        />
                        <div className="min-w-0">
                          <p className={cn("truncate font-medium", event.isDone && "line-through opacity-70")}>
                            {event.title}
                          </p>
                          {event.description && (
                            <p className="truncate text-[11px] opacity-80">{event.description}</p>
                          )}
                          <p className="text-[11px] opacity-70">
                            {TYPE_META[event.type].label}
                            {event.isOverdue ? " · Overdue" : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="mb-3 font-medium">
          {selectedDate
            ? new Date(`${selectedDate}T00:00:00Z`).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              })
            : "Select a day"}
        </p>

        {selectedDate && selectedEvents.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing due this day.</p>
        )}

        <div className="space-y-2">
          {selectedEvents.map((event) => (
            <div
              key={event.id}
              className={cn(
                "flex items-start justify-between gap-3 rounded-md border p-3 text-sm",
                event.isOverdue && "border-red-200 bg-red-50",
                event.isDone && "opacity-60",
              )}
            >
              <div className="flex items-start gap-2">
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", TYPE_META[event.type].dot)} />
                <div>
                  <p className={cn("font-medium", event.isDone && "line-through")}>
                    {event.href ? (
                      <Link href={event.href} className="hover:underline">
                        {event.title}
                      </Link>
                    ) : (
                      event.title
                    )}
                  </p>
                  {event.description && (
                    <p className="text-xs text-muted-foreground">{event.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{TYPE_META[event.type].label}</p>
                </div>
              </div>

              {event.isReminder && (
                <div className="flex shrink-0 items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={event.isDone ?? false}
                      onChange={() => handleToggle(event)}
                      className="h-3.5 w-3.5"
                    />
                    Done
                  </label>
                  <button
                    type="button"
                    onClick={() => handleDelete(event)}
                    className="text-muted-foreground hover:text-red-600"
                    title="Delete reminder"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
