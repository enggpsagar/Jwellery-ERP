"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { SellingRateHistoryRow } from "@/lib/selling-rates";

const inr = (value: number) =>
  `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/**
 * The Store Owner's own selling rates over time (SellingRateEntry) — every
 * change made from the top bar's rates chip or Settings. Separate from the
 * market rate table above it, which comes from the gold-rate API.
 */
export function SellingRateHistory({ rows }: { rows: SellingRateHistoryRow[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.label.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Your Selling Rates</CardTitle>
        <CardDescription>
          Every change to your own selling rates, newest first. Change them from the rates
          button in the top bar.
        </CardDescription>
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
                  onChange={(e) => setSearch(e.target.value)}
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
                  {filtered.map((r) => (
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
          </>
        )}
      </CardContent>
    </Card>
  );
}
