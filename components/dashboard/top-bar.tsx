"use client";

import { useEffect, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  Bell,
  Plus,
  ChevronDown,
  LogOut,
} from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Rates = {
  gold24k: number;
  gold22k: number;
  gold18k: number;
  silver: number;
};

export function TopBar() {
  const [rates, setRates] = useState<Rates>({
    gold24k: 0,
    gold22k: 0,
    gold18k: 0,
    silver: 0,
  });

  const [previousRates, setPreviousRates] = useState<Rates | null>(null);
  const [loading, setLoading] = useState(true);

  function getTrend(current: number, previous?: number) {
    if (previous === undefined || previous === null) {
      return <Minus className="h-3 w-3 text-gray-400" />;
    }

    if (current > previous) {
      return <TrendingUp className="h-3 w-3 text-green-500" />;
    }

    if (current < previous) {
      return <TrendingDown className="h-3 w-3 text-red-500" />;
    }

    return <Minus className="h-3 w-3 text-gray-400" />;
  }

  useEffect(() => {
  async function fetchRates() {
    try {
      const res = await fetch("/api/metal-rates");

      if (!res.ok) {
        throw new Error("Failed to fetch metal rates");
      }

      const data = await res.json();

      setRates(data.current);

      if (data.previous) {
        setPreviousRates(data.previous);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  fetchRates();
}, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md md:px-6">
      <SidebarTrigger className="text-muted-foreground" />

      <Separator orientation="vertical" className="h-6" />

      <div className="relative hidden flex-1 md:block md:max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

        <Input
          type="search"
          placeholder="Search customers, invoices, products..."
          className="h-9 bg-muted/60 pl-9"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="mr-2 hidden items-center gap-1 rounded-lg border bg-card px-2 py-1 shadow-sm xl:flex">
          {loading ? (
            <span className="px-2 text-xs text-muted-foreground">
              Loading...
            </span>
          ) : (
            <>
              {/* 24K */}

              <div className="rounded-md bg-gradient-to-r from-yellow-100 to-yellow-300 px-2 py-1">
                <div className="text-[9px] font-medium text-yellow-800">
                  24K
                </div>

                <div className="mt-1 flex items-center gap-1">
                  <span className="text-xs font-bold text-yellow-900">
                    ₹{rates.gold24k}/g
                  </span>

                  {getTrend(rates.gold24k, previousRates?.gold24k)}
                </div>
              </div>

              {/* 22K */}

              <div className="rounded-md bg-gradient-to-r from-amber-50 to-yellow-100 px-2 py-1">
                <div className="text-[9px] font-medium text-amber-700">22K</div>

                <div className="mt-1 flex items-center gap-1">
                  <span className="text-xs font-bold text-amber-900">
                    ₹{rates.gold22k}/g
                  </span>

                  {getTrend(rates.gold22k, previousRates?.gold22k)}
                </div>
              </div>

              {/* 18K */}

              <div className="rounded-md bg-gradient-to-r from-orange-50 to-orange-200 px-2 py-1">
                <div className="text-[9px] font-medium text-orange-700">
                  18K
                </div>

                <div className="mt-1 flex items-center gap-1">
                  <span className="text-xs font-bold text-orange-900">
                    ₹{rates.gold18k}/g
                  </span>

                  {getTrend(rates.gold18k, previousRates?.gold18k)}
                </div>
              </div>

              {/* Silver */}

              <div className="rounded-md bg-gradient-to-r from-slate-100 to-gray-200 px-2 py-1">
                <div className="text-[9px] font-medium text-gray-700">
                  Silver
                </div>

                <div className="mt-1 flex items-center gap-1">
                  <span className="text-xs font-bold text-gray-900">
                    ₹{rates.silver}/g
                  </span>

                  {getTrend(rates.silver, previousRates?.silver)}
                </div>
              </div>
            </>
          )}
        </div>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" />
          New Invoice
        </Button>

        <Button variant="outline" size="icon" className="relative">
          <Bell className="h-4 w-4" />

          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />

          <span className="sr-only">Notifications</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md px-2 hover:bg-accent">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-accent text-xs text-accent-foreground">
                RS
              </AvatarFallback>
            </Avatar>

            <span className="hidden text-sm font-medium sm:inline">
              Ramesh Soni
            </span>

            <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:inline" />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/profile">Profile</Link>
              </DropdownMenuItem>

              <DropdownMenuItem>Store Settings</DropdownMenuItem>

              <DropdownMenuItem>Billing</DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              variant="destructive"
              className="cursor-pointer"
              onClick={() =>
                signOut({
                  callbackUrl: "/login",
                })
              }
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
