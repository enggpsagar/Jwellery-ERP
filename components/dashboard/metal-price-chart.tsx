"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

import { Button } from "@/components/ui/button";

import {
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  TrendingUp,
} from "lucide-react";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

type MetalRate = {
  id: string;
  date: string;
  gold24k: number;
  gold22k: number;
  gold18k: number;
  silver: number;
  unit: string;
};

export function MetalPriceChart() {
  const [data, setData] = useState<MetalRate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRates() {
      try {
        const response = await fetch("/api/metal-rates/history");

        if (!response.ok) {
          throw new Error("Failed to fetch history");
        }

        const json = await response.json();

        setData(json);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }

    loadRates();
  }, []);

  const latest = data[data.length - 1];

  const summary = useMemo(() => {
    if (!data.length) {
      return null;
    }

    const max24 = Math.max(...data.map((r) => r.gold24k));
    const min24 = Math.min(...data.map((r) => r.gold24k));

    const max22 = Math.max(...data.map((r) => r.gold22k));
    const min22 = Math.min(...data.map((r) => r.gold22k));

    const max18 = Math.max(...data.map((r) => r.gold18k));
    const min18 = Math.min(...data.map((r) => r.gold18k));

    const maxSilver = Math.max(...data.map((r) => r.silver));
    const minSilver = Math.min(...data.map((r) => r.silver));

    const avg24 =
      data.reduce((sum, r) => sum + r.gold24k, 0) / data.length;

    const avg22 =
      data.reduce((sum, r) => sum + r.gold22k, 0) / data.length;

    const avg18 =
      data.reduce((sum, r) => sum + r.gold18k, 0) / data.length;

    const avgSilver =
      data.reduce((sum, r) => sum + r.silver, 0) / data.length;

    return {
      max24,
      min24,
      avg24,

      max22,
      min22,
      avg22,

      max18,
      min18,
      avg18,

      maxSilver,
      minSilver,
      avgSilver,
    };
  }, [data]);

  const chartData = data.map((item) => ({
    ...item,
    label: new Date(item.date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    }),
  }));

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Metal Price Trend</CardTitle>
        </CardHeader>

        <CardContent>
          <div className="h-[420px] animate-pulse rounded-lg bg-muted" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-md">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-amber-500" />
            Metal Price Trend
          </CardTitle>

          <CardDescription>
            Gold & Silver prices for the last 10 days
          </CardDescription>
        </div>

        <Button
          asChild
          variant="outline"
        >
          <Link href="/metal-rates">
            View More
          </Link>
        </Button>
      </CardHeader>

      <CardContent>

        <div className="mb-8 grid gap-4 md:grid-cols-4">

          <Card>
            <CardContent className="pt-6">

              <div className="text-sm text-muted-foreground">
                Latest 24K
              </div>

              <div className="mt-2 text-2xl font-bold">
                ₹{latest?.gold24k.toFixed(2)}
              </div>

              <div className="mt-2 flex items-center gap-1 text-green-600 text-sm">
                <ArrowUpRight className="h-4 w-4" />
                Highest ₹{summary?.max24.toFixed(2)}
              </div>

              <div className="text-xs text-muted-foreground mt-1">
                Lowest ₹{summary?.min24.toFixed(2)}
              </div>

              <div className="text-xs text-muted-foreground">
                Avg ₹{summary?.avg24.toFixed(2)}
              </div>

            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">

              <div className="text-sm text-muted-foreground">
                Latest 22K
              </div>

              <div className="mt-2 text-2xl font-bold">
                ₹{latest?.gold22k.toFixed(2)}
              </div>

              <div className="mt-2 flex items-center gap-1 text-green-600 text-sm">
                <ArrowUpRight className="h-4 w-4" />
                Highest ₹{summary?.max22.toFixed(2)}
              </div>

              <div className="text-xs text-muted-foreground mt-1">
                Lowest ₹{summary?.min22.toFixed(2)}
              </div>

              <div className="text-xs text-muted-foreground">
                Avg ₹{summary?.avg22.toFixed(2)}
              </div>

            </CardContent>
          </Card>
                    <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">
                Latest 18K
              </div>

              <div className="mt-2 text-2xl font-bold">
                ₹{latest?.gold18k.toFixed(2)}
              </div>

              <div className="mt-2 flex items-center gap-1 text-green-600 text-sm">
                <ArrowUpRight className="h-4 w-4" />
                Highest ₹{summary?.max18.toFixed(2)}
              </div>

              <div className="mt-1 text-xs text-muted-foreground">
                Lowest ₹{summary?.min18.toFixed(2)}
              </div>

              <div className="text-xs text-muted-foreground">
                Avg ₹{summary?.avg18.toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">
                Latest Silver
              </div>

              <div className="mt-2 text-2xl font-bold">
                ₹{latest?.silver.toFixed(2)}
              </div>

              <div className="mt-2 flex items-center gap-1 text-green-600 text-sm">
                <ArrowUpRight className="h-4 w-4" />
                Highest ₹{summary?.maxSilver.toFixed(2)}
              </div>

              <div className="mt-1 text-xs text-muted-foreground">
                Lowest ₹{summary?.minSilver.toFixed(2)}
              </div>

              <div className="text-xs text-muted-foreground">
                Avg ₹{summary?.avgSilver.toFixed(2)}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="h-[420px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{
                top: 10,
                right: 20,
                left: 10,
                bottom: 10,
              }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                opacity={0.2}
              />

              <XAxis
                dataKey="label"
                tick={{ fontSize: 12 }}
              />

              <YAxis
                tick={{ fontSize: 12 }}
              />

              <Tooltip
                formatter={(value: number) => [
                  `₹${value.toFixed(2)}`,
                ]}
              />

              <Legend />

              <Line
                type="monotone"
                dataKey="gold24k"
                name="Gold 24K"
                stroke="#d4af37"
                strokeWidth={3}
                dot={{
                  r: 4,
                }}
                activeDot={{
                  r: 6,
                }}
              />

              <Line
                type="monotone"
                dataKey="gold22k"
                name="Gold 22K"
                stroke="#f59e0b"
                strokeWidth={3}
                dot={{
                  r: 4,
                }}
              />

              <Line
                type="monotone"
                dataKey="gold18k"
                name="Gold 18K"
                stroke="#ea580c"
                strokeWidth={3}
                dot={{
                  r: 4,
                }}
              />

              <Line
                type="monotone"
                dataKey="silver"
                name="Silver"
                stroke="#6b7280"
                strokeWidth={3}
                dot={{
                  r: 4,
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}