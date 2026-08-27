// FILE PATH: components/dashboard/global-search.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, Users, Gem, Receipt, Hammer } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  globalSearch,
  type GlobalSearchResult,
  type GlobalSearchResultType,
} from "@/lib/actions/global-search-actions";

const TYPE_ICON: Record<GlobalSearchResultType, typeof Users> = {
  customer: Users,
  product: Gem,
  invoice: Receipt,
  karigar: Hammer,
};

const TYPE_LABEL: Record<GlobalSearchResultType, string> = {
  customer: "Customer",
  product: "Product",
  invoice: "Invoice",
  karigar: "Karigar",
};

export function GlobalSearch() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const term = query.trim();

    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timeoutId = setTimeout(async () => {
      try {
        const { results } = await globalSearch(term);
        setResults(results);
        setActiveIndex(-1);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function goTo(result: GlobalSearchResult) {
    router.push(result.href);
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = results[activeIndex] ?? results[0];
      if (target) goTo(target);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div
      ref={containerRef}
      className="relative hidden flex-1 md:block md:max-w-md"
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

      {/* Affordance only — hidden as soon as there is a query so it never
          sits behind the text the user is typing. */}
      {!query && (
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 select-none items-center gap-0.5 rounded border bg-background px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground sm:flex">
          Ctrl K
        </kbd>
      )}

      <Input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search customers, invoices, products..."
        // Recessed well rather than a bordered box, and the focus ring picks
        // up the app's gold so focus reads as part of the theme instead of
        // the browser default.
        className="h-10 rounded-full border-transparent bg-muted/70 pl-9 pr-16 shadow-inner transition-colors placeholder:text-muted-foreground/70 focus-visible:border-transparent focus-visible:bg-background focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_oklab,var(--chart-2)_30%,transparent)]"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls="global-search-results"
      />

      {showDropdown && (
        <div
          id="global-search-results"
          className="absolute left-0 right-0 top-11 z-50 max-h-96 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg"
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching...
            </div>
          ) : results.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No results for &ldquo;{query.trim()}&rdquo;
            </div>
          ) : (
            <ul>
              {results.map((result, index) => {
                const Icon = TYPE_ICON[result.type];

                return (
                  <li key={`${result.type}-${result.id}`}>
                    <button
                      type="button"
                      onClick={() => goTo(result)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm",
                        index === activeIndex
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/60"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />

                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">
                          {result.title}
                        </span>

                        {result.subtitle && (
                          <span className="truncate text-xs text-muted-foreground">
                            {result.subtitle}
                          </span>
                        )}
                      </span>

                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                        {TYPE_LABEL[result.type]}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
