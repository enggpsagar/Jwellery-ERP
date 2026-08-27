"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

import {
  getNotifications,
  type NotificationsResponse,
} from "@/lib/actions/notification-actions";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const EMPTY: NotificationsResponse = { totalCount: 0, groups: [] };
const DISMISSED_KEY = "notifications-dismissed-ids";

function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore storage errors (e.g. private browsing quota)
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationsResponse>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setDismissed(loadDismissed());

    let cancelled = false;

    async function load() {
      try {
        const result = await getNotifications();
        if (!cancelled) setData(result);
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const visibleGroups = useMemo(
    () =>
      data.groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => !dismissed.has(item.id)),
        }))
        .filter((group) => group.items.length > 0),
    [data.groups, dismissed],
  );

  const visibleCount = useMemo(
    () => visibleGroups.reduce((sum, group) => sum + group.items.length, 0),
    [visibleGroups],
  );

  function clearAll() {
    const ids = new Set(dismissed);
    for (const group of visibleGroups) {
      for (const item of group.items) ids.add(item.id);
    }
    setDismissed(ids);
    saveDismissed(ids);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative text-[var(--chart-2)] hover:text-[var(--chart-2)]"
        >
          {/* Gold, from the chart palette's slot 2 — the same hue the gold
              KPI tile and gold bars use, so "gold" means one colour across
              the app. The unread dot stays a separate, higher-contrast mark:
              gold on white is 2.78:1, too weak to signal on its own. */}
          <Bell className="h-4 w-4" />

          {visibleCount > 0 && (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
          )}

          <span className="sr-only">Notifications</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-xs text-muted-foreground">
              {loading
                ? "Loading..."
                : visibleCount === 0
                  ? "You're all caught up"
                  : `${visibleCount} item${visibleCount === 1 ? "" : "s"} need attention`}
            </p>
          </div>

          {visibleCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs text-muted-foreground"
              onClick={clearAll}
            >
              Clear all
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-80">
          {visibleGroups.length === 0 && !loading ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No new notifications
            </div>
          ) : (
            <div className="divide-y">
              {visibleGroups.map((group) => (
                <div key={group.key} className="px-4 py-3">
                  <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                    {group.label} ({group.items.length})
                  </p>

                  <div className="space-y-2">
                    {group.items.map((item) => (
                      <Link
                        key={item.id}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="block rounded-md p-2 text-sm hover:bg-accent"
                      >
                        <div className="font-medium">{item.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.description}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
