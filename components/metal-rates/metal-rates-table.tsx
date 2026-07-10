"use client";

import { useMemo, useState } from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import {
  Search,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Download,
} from "lucide-react";

type MetalRate = {
  id: string;
  date: string;
  gold24k: number;
  gold22k: number;
  gold18k: number;
  silver: number;
  unit: string;
};

type Props = {
  data: MetalRate[];
};

const PAGE_SIZE = 10;

export function MetalRatesTable({ data }: Props) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filteredData = useMemo(() => {
    return data.filter((item) =>
      new Date(item.date)
        .toLocaleDateString("en-IN")
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  }, [data, search]);

  const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);

  const dataWithTrend = filteredData.map((rate, index) => ({
    ...rate,
    previous: index < filteredData.length - 1 ? filteredData[index + 1] : null,
  }));

  const paginatedData = dataWithTrend.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  function getTrend(current: number, previous?: number) {
    if (previous === undefined) {
      return <Minus className="h-4 w-4 text-gray-400" />;
    }

    if (current > previous) {
      return <TrendingUp className="h-4 w-4 text-green-600" />;
    }

    if (current < previous) {
      return <TrendingDown className="h-4 w-4 text-red-600" />;
    }

    return <Minus className="h-4 w-4 text-gray-400" />;
  }
  function renderPrice(current: number, previous?: number) {
    if (previous === undefined || previous === null) {
      return (
        <div className="flex flex-col items-end">
          <span className="font-bold text-slate-700">
            ₹{current.toFixed(2)}
          </span>

          <span className="mt-1 flex items-center gap-1 text-xs text-gray-500">
            <Minus className="h-3 w-3" />
            --
          </span>
        </div>
      );
    }

    const diff = current - previous;

    if (diff > 0) {
      return (
        <div className="flex flex-col items-end">
          <span className="font-bold text-amber-600">
            ₹{current.toFixed(2)}
          </span>

          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
            <TrendingUp className="h-3 w-3" />
            +₹{diff.toFixed(2)}
          </span>
        </div>
      );
    }

    if (diff < 0) {
      return (
        <div className="flex flex-col items-end">
          <span className="font-bold text-yellow-600">
            ₹{current.toFixed(2)}
          </span>

          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
            <TrendingDown className="h-3 w-3" />
            -₹{Math.abs(diff).toFixed(2)}
          </span>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-end">
        <span className="font-bold text-orange-600">₹{current.toFixed(2)}</span>

        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
          <Minus className="h-3 w-3" />
          ₹0.00
        </span>
      </div>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Metal Rate History</CardTitle>

            <CardDescription>Gold & Silver historical prices</CardDescription>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() =>
                window.open("/api/metal-rates/export?format=csv", "_blank")
              }
            >
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>

            <Button
              variant="outline"
              onClick={() =>
                window.open("/api/metal-rates/export?format=excel", "_blank")
              }
            >
              Excel
            </Button>

            <Button
              onClick={() =>
                window.open("/api/metal-rates/export?format=pdf", "_blank")
              }
            >
              PDF
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="mb-5 flex items-center">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />

            <Input
              placeholder="Search by date..."
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
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>

                <th className="px-4 py-3 text-right">24K</th>

                <th className="px-4 py-3 text-right">22K</th>

                <th className="px-4 py-3 text-right">18K</th>

                <th className="px-4 py-3 text-right">Silver</th>
              </tr>
            </thead>

            <tbody>
              {paginatedData.map((rate, index) => {
                const previous = rate.previous;
                return (
                  <tr key={rate.id} className="border-t hover:bg-muted/40">
                    <td className="px-4 py-3">
                      {new Date(rate.date).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>

                    <td className="px-4 py-3">
                      {renderPrice(rate.gold24k, previous?.gold24k)}
                    </td>

                    <td className="px-4 py-3">
                      {renderPrice(rate.gold22k, previous?.gold22k)}
                    </td>
                    <td className="px-4 py-3">
                      {renderPrice(rate.gold18k, previous?.gold18k)}
                    </td>

                    <td className="px-4 py-3">
                      {renderPrice(rate.silver, previous?.silver)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredData.length === 0 && (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            No records found.
          </div>
        )}

        {filteredData.length > 0 && (
          <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-muted-foreground">
              Showing <strong>{(page - 1) * PAGE_SIZE + 1}</strong> to{" "}
              <strong>{Math.min(page * PAGE_SIZE, filteredData.length)}</strong>{" "}
              of <strong>{filteredData.length}</strong> records
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
      </CardContent>
    </Card>
  );
}
