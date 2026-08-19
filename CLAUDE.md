# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **pnpm** (`pnpm-lock.yaml` / `pnpm-workspace.yaml` are authoritative). Always use `pnpm add`/`pnpm install` for dependency changes — using `npm install` updates `package.json` but not `pnpm-lock.yaml`, which breaks Vercel's `pnpm install --frozen-lockfile` build step.

```bash
pnpm dev                    # next dev
pnpm build                  # prisma generate && next build
pnpm start                  # next start

pnpm seed                   # tsx prisma/seed.ts (states/cities + a default admin)
pnpm db:seed:demo           # demo customers/karigars/invoices/ledger entries
pnpm db:seed:inventory      # demo products
pnpm db:seed:kacha          # demo kacha slips
```

`pnpm lint` currently fails on a pre-existing issue (no `eslint.config.js` present for ESLint 10 — out of scope of the app itself, not caused by any feature work).

### Database migrations

`prisma migrate dev` does not work in a non-interactive shell here (it errors with "environment is non-interactive"). To add a migration:

```bash
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script
```

Hand-write the resulting SQL into `prisma/migrations/<timestamp>_<name>/migration.sql` (add backfill `UPDATE`s between `ADD COLUMN` and `SET NOT NULL` for any new required column on a table with existing rows — see `20260819120000_add_store_multitenancy` for the pattern), then apply with:

```bash
npx prisma migrate deploy
npx prisma generate
```

The DB is a shared Neon Postgres instance used by both local dev and the deployed app — migrations here affect production data immediately, there is no separate dev database.

## Architecture

Next.js 16 (App Router) + Prisma + NextAuth v4, deployed on Vercel. A jewellery-store ERP (customers, inventory, Pakka/Kacha billing, karigar job tracking, ledger) that was converted mid-project into a **multi-tenant SaaS** — this conversion is the load-bearing architectural fact of the codebase; almost every file under `lib/actions/` follows the pattern it introduced.

### Multi-tenancy: every query is store-scoped

There is a `Store` model, and nearly every business table (`Customer`, `Karigar`, `Product`, `InventoryStock`, `Invoice`, `KachaInvoice`, `LedgerEntry`, `KarigarJob`, `MetalRate`, `BusinessSettings`) has a required `storeId`. Previously-global unique fields (`invoiceNumber`, `slipNumber`, `productCode`, `stockCode`, `customerCode`, karigar `code`, `jobNumber`) are now `@@unique([storeId, <field>])` compound keys — uniqueness checks and number-generator counters (`generateInvoiceNumber`, `generateSlipNumber`) must filter by `storeId`, not just the field.

`BusinessSettings` is one row **per store** — its primary key is `storeId` itself (there is no `id` column; the old fixed `"default"` singleton row is gone).

The mechanical pattern used throughout `lib/actions/*.ts` — follow it exactly when touching or adding a data-access function:

1. `const storeId = await requireStoreScope()` (from `lib/store-context.ts`) at the top of every function that touches the DB.
2. Add `storeId` to every `where` on list/find/count queries, and to every `.create()` payload.
3. Never use bare `findUnique`/`update`/`delete` by `id` on a scoped model — use `findFirst`/`updateMany`/`deleteMany` with `{ id, storeId }` in the `where`, and check `count === 0` for "not found". A bare `findUnique({ where: { id } })` is a cross-store IDOR hole since `id` alone is often still globally unique.
4. Any foreign key coming from client input that references another scoped model (e.g. `customerId` on an invoice, `karigarId` on a job) must be verified to belong to the same `storeId` before use.

`getEffectiveStoreId()` / `requireStoreScope()` (`lib/store-context.ts`) resolve "the store the current request should act on": for `ADMIN`/`STAFF`/`KARIGAR` this is just their own `User.storeId`; for `SUPER_ADMIN` (whose own `storeId` is always `null`) it's read from the `active_store_id` cookie set by the store switcher in the top bar (`lib/actions/store-actions.ts`).

### Roles & permissions

Roles: `SUPER_ADMIN` (all stores), `ADMIN` (full control of their own store — the "Store Owner"), `STAFF` ("normal users", customizable per-user — see below), `KARIGAR` (logs in and sees only their own jobs via `/my-jobs`, nothing else), `MANAGER` (legacy, not offered in the UI's role picker, kept only so old rows don't break).

`lib/permissions.ts` defines the permission string constants; `lib/roles.ts` defines `ROLE_PERMISSIONS` (the fixed bundle per role) and `MODULE_DEFINITIONS` — the 6 sidebar sections an Admin can toggle per Staff user (Customers, Inventory, Billing, Karigar Management, Reports, Ledger; Dashboard is always visible, Users/Settings/Stores stay role-gated rather than per-user customizable).

`User.permissions` (a `String[]` column) stores a Staff user's custom module selection. **Empty array means "not customized" and falls back to full access** — `getEffectivePermissions()` in `lib/roles.ts` implements this fallback, and both enforcement points (`hasPermission()` in `lib/auth/auth.ts`, and the module check in `middleware.ts`) must agree on it, or a legacy/un-customized Staff account would pass one check and fail the other. Admin/Super Admin always get full access regardless of any stored `permissions` array.

Module access is enforced once, centrally, in `middleware.ts` (redirects a Staff user away from a route their permissions don't cover) rather than duplicated across the ~20 page files under the 6 module directories — extend that check, don't add per-page guards. The sidebar (`components/dashboard/app-sidebar.tsx`) mirrors the same logic client-side to hide nav items, reading `session.user.permissions` (added to the JWT/session in `lib/auth/auth-options.ts` and `lib/types/next-auth.d.ts`).

Because the session is JWT-based, a role/store/permissions change made by an Admin does not take effect for an already-logged-in user until they sign out and back in — the `jwt` callback only re-derives these fields from the DB `if (user)`, i.e. at sign-in.

### Auth

NextAuth v4 with two providers: Google OAuth and phone+OTP (`CredentialsProvider`, `lib/auth/otp-auth.ts`). Phone/OTP login does **not** auto-register — `verifyOtpLogin` throws if no existing `User` row matches, so only an Admin-provisioned phone number can complete OTP login.

Google sign-in, however, goes through the NextAuth Prisma adapter, which *does* auto-create a `User` row for any email with no store attached. `SUPER_ADMIN_EMAILS` (comma-separated env var) is checked in the `jwt` callback on every sign-in — a matching email is force-promoted to `SUPER_ADMIN` (idempotently, self-healing the DB row). Any other new Google sign-in becomes an orphaned, store-less `STAFF` user who can log in but sees nothing (every page requires a resolved `storeId`). `createUser()` in `lib/user.ts` handles the resulting "email already exists" conflict when an Admin later invites that same address: a store-less existing account is claimed into the inviting store; an account already belonging to another store, or to Super Admin, is never silently reassigned.

`GoogleProvider` has `allowDangerousEmailAccountLinking: true` set deliberately — Admins pre-create user rows by email before the person's first Google sign-in, so the first login must link to that existing row rather than erroring with `OAuthAccountNotLinked`.

### Deploy/DB mismatch trap

The database migration and the code deploy are two independent steps — running a migration against the shared Neon DB does **not** deploy the new code, and pushing code doesn't imply the DB is already migrated. If the deployed app's Prisma Client predates a schema change (e.g. a new required column), production requests can fail even though local `tsc`/dev server are clean. When making a schema change, flag to the user that both the migration *and* a deploy are needed.

### Email

`lib/mailer.ts` wraps a single `nodemailer` SMTP transporter built from `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`MAIL_FROM`. `sendMail()` never throws — a missing config or send failure returns `{ sent: false, message }` so callers can toast a status without failing the action that triggered it. Templates live in `lib/email-templates.ts`. Wired into: user creation (welcome/invite email, `app/(dashboard)/users/actions.ts`), invoice/Kacha-slip "Email Invoice"/"Email Slip" buttons, and the customer ledger card's "Email Statement" button.

### Notifications

`lib/actions/notification-actions.ts` computes live alerts (invoices with an outstanding balance, overdue karigar jobs, out-of-stock products) for the current store — there is no notifications table, they're derived from existing data each time. `components/dashboard/notification-bell.tsx` polls this every 60s and persists dismissed alert IDs to `localStorage` ("Clear all") so dismissal survives until the underlying record actually changes.

### Kacha → Pakka billing

`KachaInvoice` (provisional slip) can be converted into a real `Invoice` (`convertKachaToPakka` in `lib/actions/kacha-invoice-actions.ts`), recorded via `Invoice.convertedFromKacha` / `KachaInvoice.convertedTo`. Both directions must be shown in both the list and detail views — the list queries (`getKachaInvoices`, `getInvoices`) need the relation explicitly `include`d or the conversion badge silently never appears even though the detail-page query has it (this exact bug has recurred once already; check both query functions when touching this relation).

### Ledger

`/ledger` (`app/(dashboard)/ledger/page.tsx` + `components/ledger/ledger-view.tsx`) reads real, store-scoped `LedgerEntry` rows via `lib/actions/ledger-actions.ts` — it is not backed by mock data (an earlier version was; `lib/data.ts` was deleted when it was rewired). Client-side paginated (20/page) on top of an already-fetched batch (capped at 500 rows) with client-side filters — there is no server-driven pagination here, unlike `KarigarsPagination`'s URL-param-driven approach used elsewhere.

### Known dead/pre-existing issues (not regressions — don't "fix" without reason)

- `auth.config.ts` (repo root) and `app/api/auth/route.ts` are orphaned NextAuth v5-style leftovers, not wired to anything (`app/api/auth/[...nextauth]/route.ts` is the real handler). Both have their own pre-existing type errors.
- A handful of pre-existing, unrelated TS errors exist in `components/customers/edit-customer-dialog.tsx`, `components/customers/ledger/add-customer-ledger-entry-dialog.tsx`, `components/dashboard/metal-price-chart.tsx`, `components/inventory/products/product-form.tsx`, `components/inventory/stock/stock-create-form.tsx`, `components/inventory/stock/stock-row-actions.tsx`, and one line each in `app/(dashboard)/billing/[id]/page.tsx` and the `inventory/stock` pages. None of these are caused by the multi-tenant/permissions/email work — check `git blame` before assuming a change introduced them.
