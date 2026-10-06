"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { SellingRateHistoryRow } from "@/lib/selling-rates";

const inr = (value: number) =>
  `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/**
 * The Store Owner's own selling rates over time (SellingRateEntry) — every
 * change made from the top bar's rates chip or Settings. Separate from the
 * market rate table above it, which comes from the gold-rate API.
 */
const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

export function SellingRateHistory({ rows }: { rows: SellingRateHistoryRow[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.label.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Your Selling Rates</CardTitle>
            <CardDescription>
              Every change to your own selling rates, newest first. Change them from the rates
              button in the top bar.
            </CardDescription>
          </div>

          {rows.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  title="Export selling rates"
                  aria-label="Export selling rates"
                  variant="outline"
                  className="shrink-0 border-transparent bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-700"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(["csv", "excel", "pdf"] as const).map((format) => (
                  <DropdownMenuItem
                    key={format}
                    onClick={() =>
                      window.open(`/api/metal-rates/selling/export?format=${format}`, "_blank")
                    }
                  >
                    {format === "csv" ? "CSV" : format === "excel" ? "Excel" : "PDF"}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No selling rate changes yet.
          </p>
        ) : (
          <>
            <div className="mb-5 flex items-center">
              <div className="relative w-full max-w-sm">
                <Search className="absolute top-3 left-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by metal or purity..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left">Date &amp; time</th>
                    <th className="px-4 py-3 text-left">Rate</th>
                    <th className="px-4 py-3 text-right">Selling price</th>
                    <th className="px-4 py-3 text-left">Changed by</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/40">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {new Date(r.date).toLocaleString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3">{r.label}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {r.price != null ? (
                          <>
                            {inr(r.price)}
                            <span className="text-muted-foreground"> / {r.unit}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Cleared</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.changedBy ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filtered.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                No records found.
              </div>
            ) : (
              <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span>
                    Showing <strong>{(page - 1) * pageSize + 1}</strong> to{" "}
                    <strong>{Math.min(page * pageSize, filtered.length)}</strong> of{" "}
                    <strong>{filtered.length}</strong> records
                  </span>

                  <select
                    className="rounded-md border px-2 py-1 text-sm"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size} / page
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage((prev) => prev - 1)}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Previous
                  </Button>

                  <div className="rounded-md border px-4 py-2 text-sm font-medium">
                    Page {page} of {totalPages}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === totalPages}
                    onClick={() => setPage((prev) => prev + 1)}
                  >
                    Next
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
