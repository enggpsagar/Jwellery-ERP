import Link from "next/link"
import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import {
  ArrowRight,
  BarChart3,
  Boxes,
  CalendarClock,
  CircleDollarSign,
  FileText,
  Gem,
  Hammer,
  LogIn,
  Mail,
  MapPin,
  PackagePlus,
  ReceiptText,
  Scale,
  ScanLine,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react"

import { authOptions } from "@/lib/auth/auth-options"
import { APP_NAME } from "@/lib/constants/app"
import { Button } from "@/components/ui/button"

/**
 * Public landing page.
 *
 * Note this route is excluded from the middleware matcher — without that,
 * every visitor is redirected to /login before this ever renders, which is
 * exactly what `/` used to do.
 *
 * Deliberately says nothing about Super Admin, store provisioning or plans:
 * this page is read by the people who work in a shop, and features only the
 * platform operator can reach would be noise at best and confusing at worst.
 */

const MODULES = [
  {
    icon: Users,
    title: "Customers & Vendors",
    body: "Separate masters for who you sell to and who you buy from, each with its own running ledger, balance and statement you can email straight from their page.",
    tint: "var(--chart-1)",
  },
  {
    icon: Boxes,
    title: "Products & Stock",
    body: "Products define the design — metal, purity, default charges and typical weights. Stock entries are the physical pieces, each with its own weight, tag and status, printable as QR labels.",
    tint: "var(--chart-3)",
  },
  {
    icon: PackagePlus,
    title: "Purchases",
    body: "Record what you buy from a vendor and stock is created automatically, one entry per line item. Anything unpaid posts to that vendor's ledger as money you owe.",
    tint: "var(--chart-4)",
  },
  {
    icon: FileText,
    title: "Quotations",
    body: "Quote a customer without touching stock or the ledger. Nothing moves until you convert it to an invoice — that single step marks the stock sold and posts the balance.",
    tint: "var(--chart-5)",
  },
  {
    icon: ReceiptText,
    title: "Kacha & Pakka Billing",
    body: "Raise a provisional Kacha slip now and convert it to a formal Pakka invoice when the paperwork is ready. Both documents stay linked, so the trail is never lost.",
    tint: "var(--chart-2)",
  },
  {
    icon: Hammer,
    title: "Karigar Job Tracking",
    body: "Issue material to a goldsmith, track the job, and receive finished pieces back. Wastage folds into the fine weight credited, so a job's closing balance actually reconciles.",
    tint: "var(--chart-1)",
  },
  {
    icon: CircleDollarSign,
    title: "Ledger",
    body: "Every movement across customers, vendors and karigars in one place, plus a metal-wise view showing what was bought and sold each day with a running closing balance.",
    tint: "var(--chart-3)",
  },
  {
    icon: BarChart3,
    title: "Reports & Exports",
    body: "Revenue, outstanding balances, stock value, open jobs and a full fine-metal flow — purchased, issued, received, wastage, sold, remaining. Export any of it to Excel or CSV.",
    tint: "var(--chart-4)",
  },
  {
    icon: ScanLine,
    title: "Scan to Sell",
    body: "Scan a piece's QR label with a phone camera and its details are already filled in. Pick the customer, enter the price, confirm — the invoice is raised and the stock marked sold in one step at the counter.",
    tint: "var(--chart-2)",
  },
  {
    icon: MapPin,
    title: "Multi-location Access",
    body: "Run several counters or branches under one shop, and grant each person access only to the locations they actually work at.",
    tint: "var(--chart-5)",
  },
]

const FLOW = [
  { label: "Purchase", body: "Buy from a vendor" },
  { label: "Stock", body: "Pieces created automatically" },
  { label: "Quote or Slip", body: "Kacha slip or quotation" },
  { label: "Invoice", body: "Pakka invoice raised" },
  { label: "Ledger", body: "Balance posted, stock reduced" },
]

const JEWELLERY_SPECIFICS = [
  {
    icon: Scale,
    title: "Fine-weight maths, not guesswork",
    body: "Gold and silver convert to a common fine-weight basis using your own purity table — 24K, 22K, 916, or whatever your house standard is. Issued and received quantities become directly comparable.",
  },
  {
    icon: Gem,
    title: "Your materials, your vocabulary",
    body: "Metals, categories and item types are yours to define. A diamond dealer, a silver trader and a gold jeweller each name their own — nothing is hardcoded to one trade.",
  },
  {
    icon: ShieldCheck,
    title: "Wastage that reconciles",
    body: "Each item's wastage percentage folds into the fine weight credited back from a karigar, so a job closes against what was issued instead of reading as unexplained missing metal.",
  },
  {
    icon: CalendarClock,
    title: "Yesterday's trading, every morning",
    body: "A daily email summarises the day's credits, debits, sales and purchases with a total for each, and attaches a spreadsheet holding every transaction behind those figures. Quiet days are skipped, so it only arrives when there is something to read.",
  },
  {
    icon: Mail,
    title: "Documents that leave the building",
    body: "Email an invoice, a Kacha slip or a customer statement directly from its page, under your own business name — not a generic template.",
  },
]

const ROLES = [
  {
    title: "Store Owner",
    body: "Full control of the shop — settings, taxonomy, purity table, users and every record.",
    tint: "var(--chart-2)",
  },
  {
    title: "Staff",
    body: "Day-to-day selling, billing and inventory. You choose exactly which sections each person can open, and which locations they cover.",
    tint: "var(--chart-1)",
  },
  {
    title: "Karigar",
    body: "Signs in and sees only their own assigned jobs. Nothing else in the application is reachable.",
    tint: "var(--chart-3)",
  },
]

function TintedIcon({
  icon: Icon,
  tint,
  size = "md",
}: {
  icon: React.ComponentType<{ className?: string }>
  tint: string
  size?: "md" | "lg"
}) {
  const box = size === "lg" ? "size-11" : "size-10"
  const glyph = size === "lg" ? "size-5" : "size-[18px]"

  return (
    <div
      className={`flex ${box} shrink-0 items-center justify-center rounded-xl ring-1 ring-inset`}
      style={{
        backgroundColor: `color-mix(in oklab, ${tint} 12%, transparent)`,
        color: tint,
        // @ts-expect-error -- CSS custom property
        "--tw-ring-color": `color-mix(in oklab, ${tint} 24%, transparent)`,
      }}
    >
      <Icon className={glyph} />
    </div>
  )
}

/**
 * A CSS mock of the real dashboard rather than a stock photograph.
 *
 * Built from the app's own palette tokens, so it stays honest as the product
 * changes and follows light/dark with everything else. A hotlinked web image
 * would need a remote host allow-listed in next.config, could break or be
 * re-pointed by whoever owns it, and would show a shop that isn't yours.
 */
function AppPreview() {
  const bars = [
    { label: "Necklaces", pct: 92, tint: "var(--chart-1)" },
    { label: "Bangles", pct: 71, tint: "var(--chart-2)" },
    { label: "Rings", pct: 54, tint: "var(--chart-3)" },
    { label: "Chains", pct: 38, tint: "var(--chart-4)" },
    { label: "Coins", pct: 22, tint: "var(--chart-5)" },
  ]

  return (
    <div
      aria-hidden
      className="rounded-2xl border bg-card p-4 shadow-2xl shadow-black/10 sm:p-5"
    >
      <div className="mb-4 flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-muted-foreground/25" />
        <span className="size-2.5 rounded-full bg-muted-foreground/25" />
        <span className="size-2.5 rounded-full bg-muted-foreground/25" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Today's Sales", value: "₹1,51,776", tint: "var(--chart-3)" },
          { label: "Gold on hand", value: "1,245 g", tint: "var(--chart-2)" },
          { label: "Open Jobs", value: "12", tint: "var(--chart-4)" },
        ].map((tile) => (
          <div key={tile.label} className="rounded-lg border bg-background p-3">
            <p className="truncate text-[10px] text-muted-foreground">
              {tile.label}
            </p>
            <p
              className="mt-1 text-sm font-semibold tabular-nums sm:text-base"
              style={{ color: tile.tint }}
            >
              {tile.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-lg border bg-background p-4">
        <p className="mb-3 text-[11px] font-medium text-muted-foreground">
          Revenue by category
        </p>

        <div className="flex flex-col gap-2.5">
          {bars.map((bar) => (
            <div key={bar.label} className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-[10px] text-muted-foreground">
                {bar.label}
              </span>
              <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${bar.pct}%`, backgroundColor: bar.tint }}
                />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default async function LandingPage() {
  const session = await getServerSession(authOptions)

  // Anyone already signed in has no use for the sales pitch.
  if (session?.user) {
    redirect("/dashboard")
  }

  return (
    <div className="min-h-svh bg-background">
      {/* ---------------- nav ---------------- */}
      <header className="sticky top-0 z-30 border-b border-b-transparent bg-background/85 backdrop-blur-md [border-image:linear-gradient(90deg,transparent,color-mix(in_oklab,var(--chart-2)_38%,transparent),transparent)_1]">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--chart-2)_88%,black)] text-white">
              <Gem className="size-5" />
            </div>
            <div className="leading-tight">
              <p className="font-semibold">{APP_NAME}</p>
              <p className="text-[11px] text-muted-foreground">Jewellery ERP</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link href="/register">Register your store</Link>
            </Button>

            <Button
              asChild
              className="bg-[var(--chart-2)] text-white shadow-sm hover:bg-[color-mix(in_oklab,var(--chart-2)_88%,black)]"
            >
              <Link href="/login">
                <LogIn className="mr-1.5 size-4" />
                Login
              </Link>
            </Button>
          </div>
        </nav>
      </header>

      {/* ---------------- hero ---------------- */}
      <section className="relative overflow-hidden border-b">
        {/* Warm wash behind the hero — gold at low alpha, so it reads as
            lamplight on a counter rather than a coloured block. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(60rem 30rem at 70% -10%, color-mix(in oklab, var(--chart-2) 14%, transparent), transparent 70%)",
          }}
        />

        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-[var(--chart-2)]" />
              Built for precious-metal retail
            </span>

            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              The whole shop,{" "}
              <span className="text-[color-mix(in_oklab,var(--chart-2)_92%,black)]">
                in one ledger
              </span>
            </h1>

            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              {APP_NAME} keeps one connected record of your trade — who you buy
              from, what you hold, what your karigars are working on, what you
              sell, and who still owes you. Weights, purity and wastage are
              handled the way a jeweller actually accounts for them.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                asChild
                size="lg"
                className="bg-[var(--chart-2)] text-white shadow-sm hover:bg-[color-mix(in_oklab,var(--chart-2)_88%,black)]"
              >
                <Link href="/login">
                  Login to your shop
                  <ArrowRight className="ml-1.5 size-4" />
                </Link>
              </Button>

              <Button asChild size="lg" variant="outline">
                <Link href="/register">Register your store — free trial</Link>
              </Button>
            </div>

            <dl className="mt-10 grid max-w-md grid-cols-3 gap-6 border-t pt-6">
              {[
                { k: String(MODULES.length), v: "modules" },
                { k: "Kacha → Pakka", v: "billing flow" },
                { k: "Fine-weight", v: "accounting" },
              ].map((stat) => (
                <div key={stat.v}>
                  <dt className="text-lg font-semibold tracking-tight">
                    {stat.k}
                  </dt>
                  <dd className="text-xs text-muted-foreground">{stat.v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <AppPreview />
        </div>
      </section>

      {/* ---------------- modules ---------------- */}
      <section id="features" className="border-b py-16 lg:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-balance">
              Everything the counter needs
            </h2>
            <p className="mt-3 text-muted-foreground">
              {MODULES.length} modules that share one set of records, so a
              purchase, a repair job and a sale all describe the same piece of
              metal.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((module) => (
              <div
                key={module.title}
                className="rounded-xl border bg-card p-6 transition-shadow hover:shadow-md"
              >
                <TintedIcon icon={module.icon} tint={module.tint} />
                <h3 className="mt-4 font-semibold">{module.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {module.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- flow ---------------- */}
      <section className="border-b bg-muted/30 py-16 lg:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-balance">
              One chain, from vendor to payment
            </h2>
            <p className="mt-3 text-muted-foreground">
              Each step carries the last one forward. Nothing is retyped, and
              nothing moves in stock or the ledger until the step that should
              move it.
            </p>
          </div>

          <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {FLOW.map((step, index) => (
              <li
                key={step.label}
                className="relative rounded-xl border bg-card p-5"
              >
                <span className="text-xs font-semibold tabular-nums text-[var(--chart-2)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="mt-2 font-medium">{step.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------- jewellery specifics ---------------- */}
      <section className="border-b py-16 lg:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-balance">
              Built around how metal is actually accounted for
            </h2>
            <p className="mt-3 text-muted-foreground">
              The parts a general-purpose ERP gets wrong.
            </p>
          </div>

          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            {JEWELLERY_SPECIFICS.map((item) => (
              <div key={item.title} className="flex gap-4">
                <TintedIcon
                  icon={item.icon}
                  tint="var(--chart-2)"
                  size="lg"
                />
                <div>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- roles ---------------- */}
      <section className="border-b bg-muted/30 py-16 lg:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-balance">
              Everyone sees their own work
            </h2>
            <p className="mt-3 text-muted-foreground">
              Access is set per person, per section and per location — so a
              salesperson, a goldsmith and the owner each open a different
              application.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {ROLES.map((role) => (
              <div key={role.title} className="rounded-xl border bg-card p-6">
                <div
                  className="mb-4 h-1 w-10 rounded-full"
                  style={{ backgroundColor: role.tint }}
                />
                <h3 className="font-semibold">{role.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {role.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- closing CTA ---------------- */}
      <section className="py-16 lg:py-24">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <Gem className="mx-auto size-8 text-[var(--chart-2)]" />
          <h2 className="mt-5 text-3xl font-semibold tracking-tight text-balance">
            Ready when you are
          </h2>
          <p className="mt-3 text-muted-foreground">
            Register your shop and start a free trial, or sign in with your
            Google account or registered mobile number.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              asChild
              size="lg"
              className="bg-[var(--chart-2)] text-white shadow-sm hover:bg-[color-mix(in_oklab,var(--chart-2)_88%,black)]"
            >
              <Link href="/register">Register your store</Link>
            </Button>

            <Button asChild size="lg" variant="outline">
              <Link href="/login">
                <LogIn className="mr-1.5 size-4" />
                Login
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ---------------- footer ---------------- */}
      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <Gem className="size-4 text-[var(--chart-2)]" />
            <span>
              {APP_NAME} — Jewellery ERP
            </span>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/register" className="hover:text-foreground">
              Register
            </Link>
            <Link href="/login" className="hover:text-foreground">
              Login
            </Link>
            <span>
              &copy; {new Date().getFullYear()} {APP_NAME}
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
