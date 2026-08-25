# Swarna Suite — B2B Trade ERP

A multi-store SaaS ERP for any B2B trader dealing in precious metals, stones, or other goods — gold, silver, diamond, and beyond. Covers customers/vendors, inventory, purchases, quotations, Pakka/Kacha billing, karigar (goldsmith) job tracking with carat-based conversion, a ledger, and reporting — with per-store data isolation and per-user permissions. Every store configures its own metals, categories, and item types in Settings rather than being locked to a fixed jewellery-specific vocabulary (see CLAUDE.md's "Configurable taxonomy" section).

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
| `GOLD_API_KEY` | Daily gold/silver rate fetch (`/api/cron/metal-rates`) |
| `CRON_SECRET` | Authorizes the metal-rates cron endpoint |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage — payment receipt attachments. Get it from your Vercel project's Storage tab after creating a Blob store. |

### Database

```bash
npx prisma migrate deploy   # apply migrations
npx prisma generate         # regenerate the Prisma client
pnpm seed                   # states/cities + a default admin
pnpm db:seed:demo           # optional: demo customers/invoices/ledger data
pnpm db:seed:inventory      # optional: demo products
pnpm db:seed:kacha          # optional: demo kacha slips
```

The database is shared between local development and the deployed app (a single Neon instance) — there is no separate dev/staging database, so migrations take effect everywhere immediately.

## Roles

| Role | Scope |
|---|---|
| **Super Admin** | Every store. Creates new stores and their initial Admin from `/stores`. Signs in via a Google account listed in `SUPER_ADMIN_EMAILS` or a mobile number listed in `SUPER_ADMIN_PHONES`. |
| **Admin** ("Store Owner") | Full control of their own store — settings, users, all data. |
| **Staff** | Day-to-day sales/inventory/billing. An Admin can restrict a Staff user to specific sections (Customers, Vendors, Inventory, Billing, Quotations, Purchases, Karigar Management, Reports, Ledger) from the Users page — unrestricted by default. |
| **Karigar** | Logs in and sees only their own assigned jobs (`/my-jobs`) — nothing else in the app. |

## Deploying

Migrations and code deploys are independent — applying a migration against the database does not deploy new code, and pushing code doesn't imply the database is already migrated. After any schema change, both steps are needed before the live app is consistent.
