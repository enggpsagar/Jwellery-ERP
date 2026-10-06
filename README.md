# Swarna Suite — B2B Trade ERP

A multi-store SaaS ERP for any B2B trader dealing in precious metals, stones, or other goods — gold, silver, diamond, and beyond. Covers customers/vendors, inventory, purchases, quotations, Pakka/Kacha billing, karigar (goldsmith) job tracking with carat-based conversion, a ledger, and reporting — with per-store data isolation and per-user permissions. Every store configures its own metals, categories, and item types in Settings rather than being locked to a fixed jewellery-specific vocabulary (see CLAUDE.md's "Configurable taxonomy" section).

## What's in it

- **Parties** — customers and suppliers, with money, metal (fine gold/silver) and carat balances.
- **Inventory** — Products (the design) and Stock (the actual pieces), multi-metal / multi-stone pieces, Finish, QR & barcode tags, Excel import/export.
- **Billing** — Tax Invoices, Estimates (Kacha), Credit Notes, Offers & gift vouchers, Customer Exchange (old gold, silver, stones taken against a sale), thermal and A4 prints.
- **Purchases, Quotations, Draft Orders** — quotations and estimates convert to invoices.
- **Artisan (Karigar) management** — issue material, receive pieces, wastage and fine-weight reconciliation, artisan ledger.
- **Rates** — the Store Owner's own selling rates per purity / stone type, edited from the top bar's rates chip (history under Metal Rates → Your Selling Rates); market gold/silver rates fetched daily for reference.
- **Ledger, Payments, Reports, Dashboard** — CSV/Excel exports from the same data the screens show.
- **Multi-store SaaS** — per-store data isolation, per-user module and location access, plans, Super Admin console.

The end-user manual is [`docs/USER-GUIDE.md`](docs/USER-GUIDE.md).

## Tech stack

- **Next.js 16** (App Router) + **TypeScript**
- **Prisma** + **PostgreSQL** (Neon)
- **NextAuth v4** — Google OAuth + phone/OTP login
- **Tailwind CSS v4** + shadcn/radix UI components
- **Nodemailer** for transactional email (invites, invoice/ledger sharing)
- Deployed on **Vercel**

## Getting started

This project uses **pnpm** — always use `pnpm`, not `npm`, or the lockfile drifts out of sync with `package.json` and breaks the Vercel build (`pnpm install --frozen-lockfile`).

```bash
pnpm install
pnpm dev
```

### Environment variables (`.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (Neon) |
| `NEXTAUTH_SECRET` / `NEXTAUTH_URL` | NextAuth session signing + base URL |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth login |
| `SUPER_ADMIN_EMAILS` | Comma-separated Google account emails auto-promoted to Super Admin on first sign-in |
| `SUPER_ADMIN_PHONES` | Comma-separated registered mobile numbers auto-promoted to Super Admin on OTP sign-in |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM` | Outbound email (invites, invoice/ledger sharing) |
| `GOLD_API_KEY` | Daily market gold/silver rate fetch (`/api/cron/metal-rates`) — a reference rate only; selling rates are set by each Store Owner |
| `CRON_SECRET` | Authorizes the metal-rates cron endpoint |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage — payment receipt attachments. Get it from your Vercel project's Storage tab after creating a Blob store. |
| `BETTER_STACK_SOURCE_TOKEN` / `BETTER_STACK_INGESTING_HOST` | Ships server-side logs (`lib/logger.ts`) to a Better Stack log source for searching/dashboards, via its plain HTTP ingestion API. Both come from that source's setup page in Better Stack — the host is unique per source/region, there's no single fixed value. Optional — omitted, every log call just falls back to `console.*`. |
| `BETTERSTACK_RUM_TOKEN` | A separate, public client-side token for Better Stack's browser (RUM) monitoring tag (`app/layout.tsx`) — safe to appear in page HTML. Optional — omitted, the tag just isn't rendered. |

### Database

```bash
npx prisma migrate deploy   # apply migrations
npx prisma generate         # regenerate the Prisma client
pnpm seed                   # states/cities + a default admin
pnpm db:seed:demo           # optional: demo customers/invoices/ledger data
pnpm db:seed:inventory      # optional: demo products
pnpm db:seed:kacha          # optional: demo kacha slips
pnpm db:seed:full-demo      # optional: the complete "Aurum Demo Jewellers" store the e2e suite uses
```

The database is shared between local development and the deployed app (a single Neon instance) — there is no separate dev/staging database, so migrations take effect everywhere immediately.

See [`docs/DATABASE-SCHEMA.md`](docs/DATABASE-SCHEMA.md) for an entity-relationship reference of the full schema, grouped by domain.

## Tests

`pnpm test:e2e` runs the Playwright regression suite in `e2e/` against a local production build. CI (`.github/workflows/regression.yml`) runs it on every push to `main` and every PR. **Run it only against a throwaway local Postgres** — `e2e/global-setup.ts` refuses any non-localhost `DATABASE_URL`, because the default `.env` points at the shared production database. See [`e2e/README.md`](e2e/README.md) for the setup commands and what each spec covers.

## Roles

| Role | Scope |
|---|---|
| **Super Admin** | Every store. Creates new stores and their initial Admin from `/stores`. Signs in via a Google account listed in `SUPER_ADMIN_EMAILS` or a mobile number listed in `SUPER_ADMIN_PHONES`. |
| **Admin** ("Store Owner") | Full control of their own store — settings, users, all data. |
| **Staff** | Day-to-day sales/inventory/billing. An Admin can restrict a Staff user to specific sections (Customers, Vendors, Inventory, Billing, Quotations, Purchases, Karigar Management, Reports, Ledger) from the Users page — unrestricted by default. |
| **Karigar** | Logs in and sees only their own assigned jobs (`/my-jobs`) — nothing else in the app. |

## Deploying

Migrations and code deploys are independent — applying a migration against the database does not deploy new code, and pushing code doesn't imply the database is already migrated. After any schema change, both steps are needed before the live app is consistent.
