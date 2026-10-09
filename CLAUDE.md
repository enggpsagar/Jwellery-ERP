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

Next.js 16 (App Router) + Prisma + NextAuth v4, deployed on Vercel. A B2B trade ERP (customers/vendors, inventory, purchases, quotations, Pakka/Kacha billing, karigar job tracking with carat-based conversion, ledger, reporting) generic enough for any dealer in precious metals, stones, or other goods — not gold-jewellery-specific — that was converted mid-project into a **multi-tenant SaaS**. Both conversions are load-bearing architectural facts: almost every file under `lib/actions/` follows the store-scoping pattern below, and almost every taxonomy field (metal/category/item-type) is store-configurable rather than a fixed enum — see "Configurable taxonomy" further down before assuming any of these are hardcoded.

### Multi-tenancy: every query is store-scoped

There is a `Store` model, and nearly every business table (`Customer`, `Vendor`, `Karigar`, `Product`, `InventoryStock`, `Invoice`, `KachaInvoice`, `Quotation`, `Purchase`, `LedgerEntry`, `KarigarJob`, `MetalRate`, `BusinessSettings`, `PurityFineness`, `StoreMetal`, `StoreCategory`, `StoreCategoryType`) has a required `storeId`. Previously-global unique fields (`invoiceNumber`, `slipNumber`, `quotationNumber`, `purchaseNumber`, `productCode`, `stockCode`, `customerCode`, `vendorCode`, karigar `code`, `jobNumber`) are now `@@unique([storeId, <field>])` compound keys — uniqueness checks and number-generator counters (`generateInvoiceNumber`, `generateSlipNumber`, `generateQuotationNumber`, `generatePurchaseNumber`) must filter by `storeId`, not just the field. Numbering helpers are intentionally duplicated per action file rather than shared — matching this codebase's existing convention, not an oversight if you find near-identical `generate*Number` functions in several files.

`BusinessSettings` is one row **per store** — its primary key is `storeId` itself (there is no `id` column; the old fixed `"default"` singleton row is gone).

The mechanical pattern used throughout `lib/actions/*.ts` — follow it exactly when touching or adding a data-access function:

1. `const storeId = await requireStoreScope()` (from `lib/store-context.ts`) at the top of every function that touches the DB.
2. Add `storeId` to every `where` on list/find/count queries, and to every `.create()` payload.
3. Never use bare `findUnique`/`update`/`delete` by `id` on a scoped model — use `findFirst`/`updateMany`/`deleteMany` with `{ id, storeId }` in the `where`, and check `count === 0` for "not found". A bare `findUnique({ where: { id } })` is a cross-store IDOR hole since `id` alone is often still globally unique.
4. Any foreign key coming from client input that references another scoped model (e.g. `customerId` on an invoice, `karigarId` on a job) must be verified to belong to the same `storeId` before use.

`getEffectiveStoreId()` / `requireStoreScope()` (`lib/store-context.ts`) resolve "the store the current request should act on": for `ADMIN`/`STAFF`/`KARIGAR` this is just their own `User.storeId`; for `SUPER_ADMIN` (whose own `storeId` is always `null`) it's read from the `active_store_id` cookie set by the store switcher in the top bar (`lib/actions/store-actions.ts`).

### Roles & permissions

Roles: `SUPER_ADMIN` (all stores), `ADMIN` (full control of their own store — the "Store Owner"), `STAFF` ("normal users", customizable per-user — see below), `KARIGAR` (logs in and sees only their own jobs via `/my-jobs`, nothing else), `MANAGER` (legacy, not offered in the UI's role picker, kept only so old rows don't break).

`lib/permissions.ts` defines the permission string constants; `lib/roles.ts` defines `ROLE_PERMISSIONS` (the fixed bundle per role) and `MODULE_DEFINITIONS` — the sidebar sections an Admin can toggle per Staff user (Customers, Vendors, Inventory, Billing, Quotations, Purchases, Karigar Management, Reports, Ledger; Dashboard is always visible, Users/Settings/Stores stay role-gated rather than per-user customizable). Adding a new top-level module means touching all three of `lib/permissions.ts` (new permission constants), `lib/roles.ts` (add to `ROLE_PERMISSIONS.STAFF`/`MANAGER` + a `MODULE_DEFINITIONS` entry), and `components/dashboard/app-sidebar.tsx` (`mainNav` entry) — `middleware.ts`'s route gating and the sidebar's own visibility filter both read `MODULE_DEFINITIONS`, so a module missing from that array is invisible to route-gating even if you add the nav item by hand.

`User.permissions` (a `String[]` column) stores a Staff user's custom module selection. **Empty array means "not customized" and falls back to full access** — `getEffectivePermissions()` in `lib/roles.ts` implements this fallback, and both enforcement points (`hasPermission()` in `lib/auth/auth.ts`, and the module check in `middleware.ts`) must agree on it, or a legacy/un-customized Staff account would pass one check and fail the other. Admin/Super Admin always get full access regardless of any stored `permissions` array.

Module access is enforced once, centrally, in `middleware.ts` (redirects a Staff user away from a route their permissions don't cover) rather than duplicated across the ~20 page files under the 6 module directories — extend that check, don't add per-page guards. The sidebar (`components/dashboard/app-sidebar.tsx`) mirrors the same logic client-side to hide nav items, reading `session.user.permissions` (added to the JWT/session in `lib/auth/auth-options.ts` and `lib/types/next-auth.d.ts`).

Any *other* UI shortcut that jumps straight into a module — currently the top bar's "New Invoice" button and its account-menu "Billing" item (`components/dashboard/top-bar.tsx`) — must gate on `hasModuleAccess(moduleKey, user)` from `lib/roles.ts` rather than re-deriving the rule, or it renders a link middleware immediately bounces to `/dashboard`. That helper encodes the same two quirks as the other two enforcement points and they must not drift apart: only `STAFF` is restrictable (Admin/Super Admin always pass, `KARIGAR` always fails), and an empty `permissions` array means "not customized" → full access. The sidebar predates the helper and still inlines the check in `getNavForRole()` — a safe consolidation if you touch it, not a bug.

Because the session is JWT-based, a role/store/permissions change made by an Admin does not take effect for an already-logged-in user until they sign out and back in — the `jwt` callback only re-derives these fields from the DB `if (user)`, i.e. at sign-in.

### Auth

NextAuth v4 with two providers: Google OAuth and phone+OTP (`CredentialsProvider`, `lib/auth/otp-auth.ts`). Phone/OTP login does **not** auto-register — `verifyOtpLogin` throws if no existing `User` row matches, so only an Admin-provisioned phone number can complete OTP login.

Google sign-in, however, goes through the NextAuth Prisma adapter, which *does* auto-create a `User` row for any email with no store attached. `SUPER_ADMIN_EMAILS` (comma-separated env var) is checked in the `jwt` callback on every sign-in — a matching email is force-promoted to `SUPER_ADMIN` (idempotently, self-healing the DB row). Any other new Google sign-in becomes an orphaned, store-less `STAFF` user who can log in but sees nothing (every page requires a resolved `storeId`). `createUser()` in `lib/user.ts` handles the resulting "email already exists" conflict when an Admin later invites that same address: a store-less existing account is claimed into the inviting store; an account already belonging to another store, or to Super Admin, is never silently reassigned.

`GoogleProvider` has `allowDangerousEmailAccountLinking: true` set deliberately — Admins pre-create user rows by email before the person's first Google sign-in, so the first login must link to that existing row rather than erroring with `OAuthAccountNotLinked`.

### Deploy/DB mismatch trap

The database migration and the code deploy are two independent steps — running a migration against the shared Neon DB does **not** deploy the new code, and pushing code doesn't imply the DB is already migrated. If the deployed app's Prisma Client predates a schema change (e.g. a new required column), production requests can fail even though local `tsc`/dev server are clean. When making a schema change, flag to the user that both the migration *and* a deploy are needed.

### Vercel CPU budget (2026-10-06)

The Hobby plan's Fluid Active CPU (4h/month) is the binding limit, so server work per page view matters:

- **Prisma runs with `engineType = "client"`** (TypeScript query compiler over `@prisma/adapter-pg`), not the Rust engine. Every `PrismaClient` — app, seeds, scripts, e2e — must be built with `{ adapter: prismaAdapter() }` (`lib/prisma-adapter.ts`); a bare `new PrismaClient()` throws.
- **Client components must never import `lib/prisma` (or `lib/db`)**, even transitively — it now drags `pg` into the browser bundle and fails the build. Keep DB helpers in server-only modules (`lib/purity-db.ts`, `lib/report-builder.ts`) and pure constants/helpers in client-safe ones (`lib/purity.ts`, `lib/report-frequencies.ts`).
- Sidebar nav links are `prefetch={false}` (each prefetch was a full dynamic layout render); sidebar counts are cached 30s (`unstable_cache`, TTL-only — `revalidateTag` in a Server Action re-renders the page into the response).
- `auth()` and `getEffectiveStoreId()` are memoised per request with React `cache()`.
- The root layout doesn't read the session (`SessionProvider` lives in the `(dashboard)` layout), so `/`, `/faq`, `/contact` are static (revalidate 1h); middleware redirects a signed-in visitor from `/` to `/dashboard`.
- Client polling (notification bell, scan panel) pauses while the tab is hidden.

### Excel import errors suggest from existing records (2026-10-06)

Every `import*FromExcel` action appends a hint to its "not found" and "already exists" row errors, built with `lib/import-suggest.ts` (pure, client-safe):
- `suggestFrom()` returns the closest existing names, matched case-, space- and typo-tolerantly, along with each record's ref.
- `existingRecordHint()` names the saved record and its code.
- `earlierRowHint()` points at the earlier row of a duplicate in the same file.

Hints start with `IMPORT_SUGGESTION_MARK` (" → "). `components/shared/import-error-list.tsx` splits on it and highlights the hint, and all 7 import dialogs use it. A new importer should follow the same pattern, reusing the rows it already loaded for validation rather than running extra queries. Suggestions are hints only: the import never auto-applies them.

### Email

`lib/mailer.ts` wraps a single `nodemailer` SMTP transporter built from `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`MAIL_FROM`. `sendMail()` never throws — a missing config or send failure returns `{ sent: false, message }` so callers can toast a status without failing the action that triggered it. Templates live in `lib/email-templates.ts`. Wired into: user creation (welcome/invite email, `app/(dashboard)/users/actions.ts`), invoice/Kacha-slip "Email Invoice"/"Email Slip" buttons, and the customer ledger card's "Email Statement" button.

Every outgoing email names the store via `resolveStoreName(storeId)` (`lib/invite-email.ts`) — use it instead of reading `BusinessSettings.businessName` directly. `BusinessSettings` is only created lazily on the first Settings read, so a store whose owner has never opened Settings has **no row at all**, and a direct read falls through to a generic "your store"/"Your Store" label. `resolveStoreName` prefers `businessName`, then falls back to `Store.name` (a required column set at store creation, so effectively always present), then the generic label. Five call sites got this wrong independently before it was centralized — don't reintroduce a sixth.

### Notifications

`lib/actions/notification-actions.ts` computes live alerts (invoices with an outstanding balance, overdue karigar jobs, out-of-stock products) for the current store — there is no notifications table, they're derived from existing data each time. `components/dashboard/notification-bell.tsx` polls this every 60s and persists dismissed alert IDs to `localStorage` ("Clear all") so dismissal survives until the underlying record actually changes.

### Kacha → Pakka billing

`KachaInvoice` (provisional slip) can be converted into a real `Invoice` (`convertKachaToPakka` in `lib/actions/kacha-invoice-actions.ts`), recorded via `Invoice.convertedFromKacha` / `KachaInvoice.convertedTo`. Both directions must be shown in both the list and detail views — the list queries (`getKachaInvoices`, `getInvoices`) need the relation explicitly `include`d or the conversion badge silently never appears even though the detail-page query has it (this exact bug has recurred once already; check both query functions when touching this relation).

### Vendors & Purchases

`Vendor` mirrors `Customer` field-for-field (own master, own ledger relation) rather than sharing a table with a "type" discriminator. `Purchase`/`PurchaseItem` mirror `Invoice`/`InvoiceItem`'s shape but move stock in the opposite direction: `createInvoice` marks existing `InventoryStock` rows `SOLD`, while `createPurchase` (`lib/actions/purchase-actions.ts`) *creates brand-new* `InventoryStock` rows — one per line item, each auto-numbered via a private `generateStockCode()` (same per-file-duplicated counter pattern as invoice numbering) since nobody types a stock code by hand on this path. A `Purchase` with an outstanding `balanceAmount` logs a `CREDIT` `LedgerEntry` against the vendor — the opposite sign from a `Sale`'s customer-owes-shop `DEBIT`, since here the shop owes the vendor.

### Quotations

`Quotation`/`QuotationItem` are a pure proposal — `createQuotation` never touches stock or the ledger, unlike every other transaction type in this codebase. Only `convertQuotationToInvoice` (`lib/actions/quotation-actions.ts`) does real work: it performs the same stock-SOLD + `InventoryTransaction` + ledger-DEBIT side effects that `createInvoice` does, because the Quotation itself deliberately skipped them. If you're debugging "why didn't this quotation update stock," check whether it was ever converted — `Quotation.status`/`convertedToId` record that.

### Karigar Ledger & carat/purity conversion

A `Karigar` (job-worker) is issued raw material (`issueMaterialToKarigar`) and returns finished pieces (`receiveItemsFromKarigar`), both in `lib/actions/inventory-stock-actions.ts` (a different file from `lib/actions/inventory/stock-actions.ts`, which handles the manual stock-entry form — don't confuse the two). Gold/silver-purity metals get converted to a common "fine weight" basis via `lib/purity.ts`'s `getFinenessMap`/`toFineWeight`, backed by the store-editable `PurityFineness` table (`/settings/purity`, seeded with standard defaults — 24K=100%, 22K=91.6%, etc. — on first read, same lazy-create-on-first-access pattern as `BusinessSettings`). Whether a given metal goes through this fine-weight math at all is decided by `StoreMetal.hasPurity` (see "Configurable taxonomy" below), **not** a hardcoded Gold/Silver check — Diamond and other non-purity metals skip it entirely and their raw weight is recorded on `LedgerEntry.metalWeight` instead of `metalWeightFine`, so the fine-gold running balance stays a strictly precious-metal number. Wastage is not cosmetic: `receiveItemsFromKarigar` folds each item's `wastagePercent` into the fine weight actually credited back to the job (`fineWeight + fineWeight * wastagePercent/100`), so a job's closing balance reconciles against what was issued instead of reading as unexplained missing gold. The Karigar Ledger view (`getKarigarLedger` in `lib/actions/ledger-actions.ts`) is a from-scratch running-balance computation — no other ledger view in this codebase computes one, don't assume `getLedgerEntries`'s shape already does this.

The standalone **Receive Material** dialog (`recordMaterialReceiptFromKarigar`, no open job) weighs the same way since 2026-09-29: Gross − Less = Net (server-recomputed), fine weight for a purity metal, plus Wastage % on top — that total is the metal CREDIT. A Making Charge (flat ₹ or ₹ per gram of net weight) is a separate cash DEBIT, mirroring the job path's Labour Charge. It still never creates stock.

### Locations: a store-scoped taxonomy table plus a real access-control axis

`StoreLocation` (`/settings/locations`, actions in `lib/actions/store-location-actions.ts` — deliberately not named `location-actions.ts`, that name is already taken by the unrelated State/City lookup module used on Customer/Vendor address forms) mirrors `StoreMetal`'s pattern: a flat, store-scoped, soft-deactivate-only list. `InventoryStock`, `Purchase`, `Invoice`, `KachaInvoice`, `KarigarJob`, `LedgerEntry`, and `Karigar` all carry a nullable `locationId` + `location` relation. `InventoryStock.location` used to be a free-text string; the migration that introduced `StoreLocation` (`20260826180000_add_store_location`) backfills one `StoreLocation` row per distinct pre-existing `(storeId, location)` text pair and points every row's new `locationId` at it, so existing data survives the conversion — don't assume a fresh, empty table.

Unlike taxonomy, Locations are also a real **access-control axis**, resolved by `lib/location-scope.ts`'s `getLocationScope()`:
- `ADMIN`/`SUPER_ADMIN` are always unrestricted.
- `STAFF` is restricted only if they have 1+ `UserLocationAccess` grants (managed in the Users dialog's "Location Access" checkbox grid, same UI pattern as "Module Access") — **zero grants means unrestricted**, the same "empty = unrestricted" rule `permissions` already uses, so both axes are reasoned about identically. `UserLocationAccess` rows are synced (delete-then-recreate) inside `createUser`/`updateUser` in `lib/user.ts`.
- `KARIGAR` is scoped to their own `Karigar.locationId` (a single value, not a grant table — one karigar works out of one place) as an *additional* filter layered on top of the existing row-level `karigarId` restriction — not a replacement for it.

`locationWhere(scope)` returns a spreadable Prisma `where` fragment (`{}` when unrestricted) — every list/report/ledger query that reads a location-bearing model spreads it in alongside `storeId`. `isLocationAllowed(scope, locationId)` is the write-side check — call it before persisting a client-submitted `locationId` (same IDOR-prevention shape as validating a `productId`/`metalTypeId` belongs to the store) so a restricted Staff user can't file a transaction against a location outside their grants just by posting its id.

Because `UserLocationAccess` isn't a plain column (unlike `permissions`), it doesn't come back from NextAuth's default adapter user object — `lib/auth/auth-options.ts`'s `jwt` callback does a one-off `userLocationAccess.findMany` at sign-in (same spot the store's `isActive` check already lives) and stores the resolved ids as `token.locationIds`/`session.user.locationIds`. This means, same as role/store/permissions, a location-grant change made by an Admin doesn't take effect for an already-logged-in Staff user until they sign out and back in.

**Not yet wired to a UI, schema-and-list-filtering only:** `Invoice`/`KachaInvoice` creation doesn't have a Location picker on their forms yet (their *list* views are already scope-filtered) — Purchases and the Karigar issue/receive flows do have one. Extending the remaining forms is a small, contained follow-up (mirror `purchase-form.tsx`'s Location `<Select>`), not a schema change.

### Configurable taxonomy: Metal/Category/Type are per-store data, not enums

`MetalType`, `InventoryCategory`, and `OrnamentType` **used to be** fixed Prisma enums and no longer exist — they were fully replaced by relational, store-scoped tables (`StoreMetal`, `StoreCategory`, `StoreCategoryType`, managed at `/settings/taxonomy`) because this is a generic B2B app, not a gold-jewellery-specific one: a diamond or platinum dealer needs to name their own materials rather than being forced into a 3-value Gold/Silver/Other bucket. Every model that used to carry `metalType MetalType` now carries `metalTypeId String?` + a relation still named `metalType` (so `item.metalType` reads naturally as an object, just no longer a raw string — check `.metalType?.name` for display, `.metalType?.id` for re-selecting it in a form). `Product` similarly carries `categoryId`/`categoryTypeId` + relations `category`/`categoryType`. All three FK columns are nullable at the schema level even on models where the old enum was required — "required" is enforced at the action layer instead, the same non-enforced-by-schema pattern used elsewhere in this codebase.

Stores that existed when this migration ran got 3 default `StoreMetal` rows ("Gold"/"Silver" with `hasPurity: true`, "Other" with `hasPurity: false`), 6 default `StoreCategory` rows, and 16 default `StoreCategoryType` rows under "Ornament" via a one-time backfill. Since 2026-10-05 **every new store** (both `registerStore` and Super Admin `createStoreWithAdmin`) is seeded inside its creation transaction by `seedStarterMasters()` (`lib/inventory/starter-masters.ts`): Gold/Silver/Platinum with their purities and fineness, Diamond/Ruby/Emerald/Sapphire as carat-weighed gemstones with stone types, Other, the starter categories/types, styles, stone clarities and four GST rates (3% default, 0.25%, 5% job work, 0%). Existing stores were deliberately **not** backfilled with these (user decision, 2026-10-05) — don't add a migration for it without asking. The GST figures follow the `hallmarkChargePerPiece` "verify locally" convention — the cut & polished diamond rate in particular is disputed between sources (0.25% / 1.5% / 3%) and needs CA confirmation.

**Purity/fineness deliberately did not become configurable in the same way** — `PurityType` (24K/22K/etc.) and `PurityFineness` are unchanged, and only apply to metals with `StoreMetal.hasPurity: true`. This was an explicit scope decision (asked and confirmed), not an oversight — don't assume a custom metal like "Platinum" needs its own purity/fineness table without checking whether that's actually been requested, since building one is a materially bigger change (it touches every fine-weight calculation in the Karigar ledger and Gold Flow report).

The Category→Type picker (`components/inventory/products/product-form.tsx`) cascades the same way the existing Customer form's State→City picker does (`getStoreCategoryTypes(categoryId)` fetched client-side on category change) — but unlike City (which submits a free-text name), Type submits a real FK id, so the Type `<select>` is controlled, not the City pattern's uncontrolled `defaultValue`.

### Ledger

`/ledger` (`app/(dashboard)/ledger/page.tsx` + `components/ledger/ledger-tabs.tsx`, labeled just "Ledger" in the UI — it covers every configured metal, not only gold/silver) reads real, store-scoped `LedgerEntry` rows via `lib/actions/ledger-actions.ts`'s `getLedgerEntries()` — it is not backed by mock data (an earlier version was; `lib/data.ts` was deleted when it was rewired). The "Ledger Entries" tab (`components/ledger/ledger-view.tsx`) is client-side paginated (20/page) on top of an already-fetched batch (capped at 500 rows) with client-side filters — there is no server-driven pagination here, unlike `KarigarsPagination`'s URL-param-driven approach used elsewhere. This is the general cross-account ledger; a single karigar's ledger with running fine-gold/cash balances is a separate, from-scratch computation — see "Karigar Ledger" above, don't conflate the two.

A second "Metal-wise" tab (`components/ledger/metal-daily-ledger.tsx`, data from `getMetalDailyLedger()`) shows a day-by-day Gold/Silver/Diamond purchased/sold breakdown with a running closing balance per metal. **This is deliberately not built from `LedgerEntry`** — a SALE/PURCHASE `LedgerEntry` only ever carries a money balance-due amount (see `recordInvoicePayment`/`createInvoice` in `invoice-actions.ts`), never metal weight or type, and is only created at all when a balance is outstanding (a fully-paid invoice logs no `LedgerEntry`). So `getMetalDailyLedger()` instead aggregates `PurchaseItem`/`InvoiceItem`/`KachaInvoiceItem` directly (same source tables `getMetalWiseReport()` in `report-actions.ts` uses for its all-time-total version of the same breakdown), grouped by day and classified into GOLD/SILVER/DIAMOND via `classifyMetalName()` — same fixed-family convention as `getLedgerTotals()`'s `unitTotals`, not the fully-configurable `StoreMetal`-row model `getMetalWiseReport()` uses. A metal not in the store's configured Business Units (Settings → Business Units) is silently dropped from this view even if `StoreMetal` rows/transactions for it exist, matching `getLedgerTotals()`'s existing behavior — not a new gap introduced here.

**Diamond is carat-based, not money-based.** Diamond used to be tracked in the Ledger as a rupee-equivalent value (`BusinessUnit`'s `DIAMOND` fell through `formatUnitValue`'s default ₹ branch, and `LedgerEntry`/manual customer-ledger entries stored a Diamond transaction's `amount` instead of a quantity). This was changed so Diamond is quantity-based like Gold/Silver, just in carats instead of grams: `lib/business-units.ts`'s `CARAT_BASED_UNITS` (parallel to `WEIGHT_BASED_UNITS`) drives `formatUnitValue`'s "X.XXX ct" branch; `LedgerEntry.caratWeight` (`Decimal(10,3)`, migration `20260902200000_add_ledger_entry_carat_weight`) holds the quantity for a Diamond entry, mirroring how `metalWeight`/`metalWeightFine` hold it for Gold/Silver; `getLedgerTotals()`/`getCustomerLedgerSummary()`'s per-unit totals and `getMetalDailyLedger()`'s `valueFor()` all read `caratWeight` (or the relevant `PurchaseItem`/`InvoiceItem`/`KachaInvoiceItem.caratWeight` column) for the DIAMOND case instead of `amount`; and the manual "Add Sale Entry"/"Add Refund Entry" dialogs (`components/customers/ledger/`) now ask Diamond for a metal type + carat quantity, the same shape as Gold/Silver's metal type + gram weight, instead of a bare ₹ amount. **Not changed**: the Karigar issue/receive-material flow (`lib/actions/inventory-stock-actions.ts`, `issueMaterialToKarigar`/`receiveItemsFromKarigar`) still measures a Diamond job in the same weight (grams) fields as Gold/Silver (`KarigarJob.issueWeight`/`receiveWeight`) — converting that to carats would also touch the wastage-percent fine-weight reconciliation math described above and wasn't part of this change; flag it for a deliberate decision before touching.

Both the Ledger (`/ledger/export`) and Reports (`/reports/export`) pages export to CSV/XLSX via `<ExportMenu>` (`components/shared/export-menu.tsx`) hitting a route handler that re-calls the same `lib/actions/*.ts` functions the page already renders from, so exported rows can never drift from what's on screen. `lib/excel-export.ts`'s `buildCsvExport`/`buildExcelExport` are the shared row→file builders — use them for any new export route instead of hand-rolling XLSX/CSV again. Since 2026-10-06 nothing hand-rolls XLSX any more (the dead `customers/export` route is deleted; Artisans and metal rates use the builders), and the builders give every workbook a frozen, bold yellow header row (`styleHeaderRow`, patched into the saved XML — SheetJS community can't write styles).

### Fixed 2026-09-03/04: Making Charge / stone-weight staleness, plus a UI convention worth reusing

Two related "stale derived value" bugs, both in per-line-item pricing on Invoice/Kacha forms:

- `MakingChargeInput`'s percent mode computed a flat ₹ amount from `rate × netWeight` only at the moment the percent field itself was typed, and never re-derived it when `rate`/`netWeight` changed afterward — a corrected metal rate silently left Making Charge (and the whole invoice total) frozen at a stale, wrong figure while the "= ₹X" hint kept recalculating live and looked correct. Fixed with a `useEffect` keyed on `[mode, percent, metalValue]` that re-emits the resolved amount whenever the base changes while in percent mode. The same pattern was generalized into a new `components/shared/percent-or-flat-input.tsx` (`PercentOrFlatInput`, taking a plain `base: number`) used for the whole-document **Discount** field on Invoice/Kacha/Purchase/Quotation — built with the staleness fix from day one.
- `netStoneWeightTouched` was being set unconditionally to `true` whenever a stock item was linked to a line (meant to protect a stock's real recorded `stoneWeight` from being overwritten by the Carat-Weight auto-fill), even when that stock had no real weight recorded (`0`/`null`) — permanently blocking Net Stone Weight's auto-fill for stones added after the fact. Fixed in `invoice-form.tsx` (`applyStockToItem`, `addScannedStock`) with a conditional check on the stock's actual recorded value; fixed unconditionally to `false` in `kacha-invoice-form.tsx` since its `StockOption` type never carries `stoneWeight` at all.

**Lesson for any new "compute X from Y, but let the user override X" field**: the derived value must react to every input it depends on via `useEffect`, not just its own field's `onChange` — recompute-on-own-change-only is the bug shape to watch for, and a live-updating hint label next to a frozen stored value is exactly the kind of thing that looks correct in a screenshot while being wrong underneath.

### Stone pricing: one section owns the whole thing

`components/inventory/shared/stone-component-fields.tsx` (`StoneComponentFields`) used to render only the Stone/Stone-Type picker; it now renders the picker **and** Carat Weight, Stone Rate, Stone Charge, and Net Stone Weight together as one grouped section, so Invoice/Kacha/Product-form line items all get the same layout and the same Carat→Net-Stone-Weight auto-fill instead of three independently-drifting implementations. Its prop surface grew accordingly (`caratWeight`/`onCaratWeightChange`, `stoneRate`/`onStoneRateChange`, `stoneCharge`/`onStoneChargeChange`/`stoneChargeTouched`, `stoneWeightInput`/`onStoneWeightInputChange`/`stoneWeightUnit`/`onStoneWeightUnitChange`/`netStoneWeightTouched`, in addition to the original picker props) — check the current component before wiring a new caller rather than assuming last-seen props still match.

### Added 2026-10-08: stock comes in only on a purchase bill

Every "Add Stock" entry point (Purchases page, product panel, Stock list, sidebar "+") opens **New Purchase** (`/purchases/new?productId=`), and Add Product no longer offers its own stock entry — so every piece from a supplier carries a payable, GST and the supplier's bill no. A purchase line is "Existing product — search…" or "+ New product" (manual line, details inline, Product minted on save). For an existing product the **weights and HSN are the piece's own**: pre-filled from the Product but editable, and `lockLinkedProductFields` keeps a positive client weight (only identity — name/metal/purity/stone — is locked). `/inventory/stock/new` still works by URL (Edit Stock shares its form; e2e use it) but nothing links to it. Older Add Stock pieces can be turned into a bill with "Convert to purchase" on the stock detail (`?fromStockId=` → `applyExistingStockLines` reuses the stock row and drops its ADJUSTMENT metal entry). Prices/opening stock with no real supplier also go through New Purchase (user decision).

### Search + "Add new" inside a `<Select>`

The pattern (first built for the Stone picker, now also on Location, and on Product-form's Category/Type/Metal Type/Default Purity) is a plain `<Input>` inside a `<div className="p-2">` at the top of `SelectContent`, filtered client-side via `useMemo`, with `onKeyDown={(e) => e.stopPropagation()}` — without that stop, Radix Select's own keyboard nav steals the search box's keystrokes. "Add new" is a small `Dialog` + `useActionState`, appending the created row to local state via an `onCreated` callback (see `AddMetalDialog`, generalized from the old stone-only `AddStoneDialog` via an `isGemstone?: boolean` prop; `AddCategoryDialog`/`AddCategoryTypeDialog` mirror the same shape). Default Purity is search-only, no add-new, since `PurityType` is a fixed Prisma enum, not a store-configurable table.

### Hallmark Charge

`BusinessSettings.hallmarkChargePerPiece` (`Decimal @default(45)`) is a new store-level setting (labeled as a starting figure the store should verify against their own hallmarking centre, same "not authoritative, verify locally" convention as `PLACEHOLDER_TDS_THRESHOLD` in the sibling `taxfriend-boss` project). Auto-applied as `hmCharge` per line item on Invoice/Kacha/Quotation (not Purchase — a vendor's own HM charge is a different concept) whenever the line's purity is hallmarkable per `isHallmarkablePurity` (`lib/purity.ts`). `KachaInvoiceItem.hmCharge`/`QuotationItem.hmCharge` are new columns — only `InvoiceItem` had this field before.

### Invoice numbering is date-stamped but store-wide running, not daily-resetting

`generateInvoiceNumber` (`lib/actions/invoice-actions.ts`) is `{prefix}-{YYYYMMDD}-{paddedCount}`, where the date segment is always today's date but the count is a plain running total across every invoice this store has ever raised (`invoiceNumber: { startsWith: "{prefix}-" }`, not scoped to today's own date segment) — so GJ-20260922-0101 is followed by GJ-20260923-0102 the next morning, not a reset back to GJ-20260923-0001. It briefly *was* scoped to today's own date segment (a real daily-reset counter, mirroring `SupportTicket.ticketNumber`'s `TKT-{YYYYMMDD}-{HHMM}-{seq}` shape) but that read as the number "starting over" each day, which is exactly what a user flagged — fixed back to a running count that just happens to carry today's date. **Purchase/Quotation/Kacha slip numbers still use the plain `{prefix}-{year}-{count}` shape** (no date segment at all) — this was scoped to Invoice only; extending the others is an easy, not-yet-requested follow-up, don't assume it's already done.

### Sortable list columns: two different mechanisms, don't cross-wire them

Every server-paginated entity list (Products, Stock, Customers, Vendors, ...) sorts via `DataTableToolbar` (`components/shared/data-table-toolbar.tsx`) — a dropdown that manages `sortBy`/`sortOrder` as URL search params, feeding a Prisma `orderBy` built by that entity's own `get*OrderBy()` function (e.g. `getProductOrderBy`, `getStockOrderBy`). A nullable relation sorts via `{ relationName: { name: sortOrder } }` (e.g. `category`, `metalType`, `product`, `location`). This is a **different** mechanism from the Reports section's `SortableTh` (`components/reports/report-table-controls.tsx`), which sorts an already-fully-loaded dataset client-side by local React state with clickable-arrow headers — the two must not be conflated when extending either one. Products/Stock's sort option lists were both extended today (Category/Type/Metal/Purity/Net Weight/Status for Products; Stock Code/Product/Metal/Purity/Qty/Status/Finish/Location/Purchase Date for Stock) — adding another sort field to any entity means extending its `get*OrderBy` + its `sortOptions` array, nothing else.

### Observability: Better Stack logging

`lib/logger.ts` (`server-only`) ships structured logs to Better Stack via a plain `fetch` POST to its HTTP log-ingestion API — not the `@logtail/node` SDK, which was tried first and removed: it batches internally and only ships on flush, a real risk on Vercel's serverless functions (an instance can freeze right after the response is sent), and it depends on Node's `http`/`https` modules so it can't run on the Edge runtime (middleware) at all. A single awaited `fetch` has neither problem and needs `BETTER_STACK_SOURCE_TOKEN` + `BETTER_STACK_INGESTING_HOST` (both from the source's setup page in Better Stack, host is unique per source/region). Absent either, every call falls back to plain `console.*` — nothing breaks before they're configured.

Nearly every `console.error(...)` across `lib/actions/**` and `app/api/**` was converted to `logger.error(message, error)` in one pass — but that only covers errors inside a `try/catch` that already existed. Three more layers close the rest of the gap, all landing in the same Better Stack source:
- `instrumentation.ts`'s `onRequestError` — catches anything Next.js itself catches server-side with no explicit try/catch (a Server Component render throwing, a Route Handler/Server Action throwing), across both the Node runtime and Edge (`routeType: 'proxy'` is middleware).
- `instrumentation.ts`'s `register()` — `process.on('unhandledRejection'/'uncaughtException')`, Node runtime only, for errors outside Next's request lifecycle entirely (e.g. a fire-and-forget async call with no `.catch()`).
- Client-side errors (`app/(dashboard)/error.tsx`, `app/global-error.tsx`) can't import `lib/logger.ts` (server-only, and shipping needs the secret source token) — they call `lib/report-client-error.ts` instead, which POSTs to `app/api/log-client-error/route.ts`, the only client-reachable thing allowed to call the real logger. That route is deliberately unauthenticated (an error can happen before a session exists) and truncates every field before logging, since the body is untrusted input.

`app/layout.tsx` also renders a separate Better Stack **browser (RUM) monitoring** tag, gated on `BETTERSTACK_RUM_TOKEN` — a different product and a different, intentionally-public client-side token from `BETTER_STACK_SOURCE_TOKEN`. Don't conflate the two when touching either.

### Added 2026-09-25: GST Rate on Product — per Metal/Stone component, not once per product

First landed as a single `Product.gstRateId` (migration
`20260925060000_add_product_gst_rate`), then corrected same-day: a jewellery
product's Metal and embedded Stone commonly carry *different* GST rates (the
same reason `InvoiceItem.gstRateId` is picked per line rather than once per
document — see `GstRate`'s own schema doc comment), so one rate for the whole
product can't express that. Migration
`20260925070000_move_gst_rate_to_product_components` drops the Product-level
column and adds `gstRateId` to `ProductMetalComponent` and
`ProductStoneComponent` instead — each Metal row and each Stone row on
Add/Edit Product (`components/inventory/products/product-form.tsx`) now has
its own GST Rate picker (Settings > GST Rates), defaulting new rows to the
store's own default rate (`resolveDefaultGstRateId`, same fallback order as
`invoice-form.tsx`'s). Same as before, this is a plain live FK (not a
snapshot trio) — it should keep tracking a later rename of the same
`GstRate` row rather than freezing one, since it's the component's ongoing
classification, not a record of a rate actually charged. The Estimated Value
box computes GST per row against its own rate, grouped by rate so e.g. two
Gold rows taxed the same show as one combined line, then a GST-inclusive
grand total. **Not yet wired further**: nothing currently reads this to
prefill a Stock/Invoice/Purchase line's own `gstRateId` the way `hsnCode`
already gets copied onto a Stock entry — that prefill wiring is a real,
separate follow-up if wanted, not done in this pass.

### Added 2026-09-29: every Invoice line is sold from real stock (Product → Add Stock → Sell)

An Invoice line entered via "Create New Line Item" used to be saved with no
`inventoryStockId` — no Product, no stock, no availability check, nothing
deducted. Now `createInvoice`/`updateInvoice` call
`createStockForManualSaleLine` (`lib/inventory/manual-line-stock.ts`)
inside the invoice's own transaction for each such line: it mints a real
Product (same SKU prefix/sequence as Purchase's `createProductFromManualEntry`),
an `IN_STOCK` `InventoryStock` row holding the line's quantity, and an
`ADJUSTMENT` stock-in transaction, then the line is sold through the normal
guarded decrement (→ qty 0, `SOLD`). Cancel/delete restores it like any
other sold stock. The whole transaction is retried on a product/stock code
collision (`withManualStockCodeRetry`) since a failed insert aborts a
Postgres transaction. No metal `LedgerEntry` is written for the stock-in
(it would inflate the metal balance with no matching sale-side credit).

Same pass tightened sell-side validation: a linked stock id that doesn't
resolve is now an error (it used to silently become an unlinked manual
line), and only `IN_STOCK` rows can be sold — both in the pre-check and in
the decrement's `where` (updateInvoice exempts rows this invoice itself
already holds, since it restores them first). **Not changed**: Kacha
slips and Quotation conversion still allow unlinked manual lines.

**2026-10-02: the minted Product is now a complete catalog entry.** It
used to get only name/metal/weights — no Category, Type, Style or
per-Metal Purity — so it fell outside every category-grouped report.
A "Create New Line Item" line's Details region now asks for Category /
Type / Style (opened automatically), and `validateManualSaleLines`
(same file) enforces Add Product's own rules before the transaction:
item name, Metal, Category (unless the metal `isGemstone`), Style (only
when `styleFieldEnabled` **and** the store has ≥1 active style — stores
created after the StoreStyle backfill migration have none), gross and net
weight. `createStockForManualSaleLine` also resolves `storeMetalPurityId`
from the line's `purityLabel`, builds the SKU with category/type/style
like `createProduct`, and writes the `ProductMetalComponent` (+
`ProductStoneComponent`) rows Add Product writes. A pre-09-29 invoice
line with no stock now needs these filled before the invoice can be
edited. Purchase's `createProductFromManualEntry` still mints
unclassified products — same gap, not yet fixed.

**2026-10-02: every hand-typed line records where its metal came from.**
A **Purchased From** party is **required** on every line with no linked
stock — Invoice's "Create New Line Item" (in "New product details", listed
under "Still needed"), and any unlinked Kacha slip / Quotation line. The
picker (`components/billing/source-party-select.tsx`) is fed by
`getSupplierOptions()`: Suppliers only when Settings → Supplier Module is
on, every party when it's off. Server rules live in
`lib/inventory/line-source-party.ts` (`resolveLineSourceParties`,
`markSourcePartiesAsSuppliers`). Where it lands:
- **Invoice** — the minted stock row's `vendorId`/`vendorName` (the columns
  `createPurchase` fills), so the Item Ledger says "Purchased from X".
- **Kacha / Quotation** — the line's own `KachaInvoiceItem`/`QuotationItem`
  `vendorId`/`vendorName` (migration `20261002120000_add_line_item_source_party`),
  shown under the item name on the detail page. Those lines still never
  mint stock, including on Kacha→Pakka or Quotation→Invoice conversion,
  so the party stays on the Kacha/Quotation line (the converted invoice
  links back to it).
- The party is flagged `isSupplier` when the piece is sold (Invoice, Kacha,
  Quotation *conversion*) — not when a quotation is merely created.
- Kacha Excel import requires it too since 2026-10-06 (a Purchased From column per line).
Not `CustomerSelect` on purpose: it reacts to `newCustomerId` and writes a
hidden `customerId`, so one per line would hijack the document's own party.
No metal `LedgerEntry` is written against the party — it's attribution,
not a payable.

### Added 2026-10-02: every metal weight is also stored as pure (24K / 999) fine weight

User decision: keep the physical weight (what's printed, tagged and priced)
**and** store its pure-metal equivalent, and make **every balance, total
and report sum the fine figure** — 100 g of 22K counts as 91.6 g, buying or
selling, vendor, artisan or customer.

- `fineWeight Decimal?` on `InventoryStock`, `PurchaseItem`, `InvoiceItem`,
  `KachaInvoiceItem`, `QuotationItem` — same unit and per-piece/per-line
  basis as that row's `netWeight`. Karigar tables and `LedgerEntry`
  already had their own fine columns (`issueFineWeight`/`receiveFineWeight`,
  `KarigarReceiptItem.fineWeight`, `metalWeightFine`).
- **Rule** (`lib/fine-weight.ts`, `getFineWeightResolver(storeId)` — call
  it before a transaction): `hasPurity` metal → netWeight × fineness / 100,
  fineness = the metal's own `StoreMetalPurity` row (metal + `purityLabel`)
  → else the store's `PurityFineness` for the legacy enum → else 100; any
  other metal → netWeight itself. The same rule is the backfill SQL in
  migration `20261002140000_add_fine_weight`; `pnpm db:backfill:fine-weights`
  re-runs it (CI does, after the demo seeds, which bypass the write paths).
  Keep the TS and SQL identical.
- **Every write path sets it**: purchases (lines + their stock), invoices
  (create/update/single-line edit, minted manual-line stock), Kacha (create,
  Excel import), quotations, Kacha→Pakka and Quotation→Invoice (copied),
  manual Add/Edit Stock (its ADJUSTMENT ledger entry now uses the same
  rule, not the enum-only `toFineWeight`), karigar receipts, product-seeded
  stock. **A new write path must set it too.**
- **Every total reads it** via `fineOrNet(row)` (`lib/fine-weight-read.ts`,
  client-safe, `fineWeight ?? netWeight`): sales/valuation/stock/metal-wise/
  vendor/gold-flow/item-ledger reports, the Metal-wise daily ledger, the
  dashboard stock KPI and recent transactions; karigar outstanding/metal-wise
  "with artisan" use `issueFineWeight ?? issueWeight`; ledger rows show
  `metalWeightFine ?? metalWeight`. Per-row displays keep the physical
  weight with a Fine (24K) column beside it; labels say "Fine Wt 24K".
- Settings → purity with a blank fineness now defaults from its label
  (22K → 91.6, 925 → 92.5, nK → n/24, 3-digit → ‰) instead of 100%, so a
  new purity can't silently count as pure. Settings → Metals & Categories
  also flags any existing purity whose fineness doesn't match its label
  (`lib/purity-fineness-check.ts`, `getMisconfiguredPurities`) with a
  one-click `fixPurityFineness`.
- Not covered: `DraftOrderItem.estimatedWeight` (an estimate, no stock),
  `InventoryTransaction` weights (nothing totals them).

### Added 2026-10-02: Customer Exchange (customer sells gold / silver / diamonds against a sale)

On **New Invoice** a "Customer Exchange" block (`components/billing/old-gold-exchange-section.tsx`;
code names still say old-gold) takes whatever the customer sells the shop:
- **Metal piece** (any `hasPurity` metal — gold, silver, platinum): purity,
  gross/net weight, deduction %, pure rate (prefilled from the latest Metal
  Rate: gold24k / silver). Metal value = fine (24K / 999) weight × rate ×
  (1 − deduction%). Each piece first asks **"Does this piece have a
  stone?"** (`components/shared/stone-presence-question.tsx`); on → the
  shared `StoneComponentFields` panel; the stone's weight comes off the gross
  (net follows gross − stone until typed) and its value (₹0 allowed) is
  added. Stored on the line/stock's stoneWeight/caratWeight/stoneRate/
  stoneCharge/stoneMetalTypeName.
- **Loose diamond / gemstone** (`isGemstone` metal): carats × rate per
  carat, no purity; netWeight in the metal's primaryUnit, fineWeight = net.
Client preview `lib/old-gold/value.ts` + `oldGoldLineAmounts`; the server
(`resolveOldGoldLines`) recomputes and is the real figure. `createInvoice`
records it in the sale's own transaction via `recordOldGoldExchange`
(`lib/old-gold/exchange.ts`):
- **Customer → Business**: a real `Purchase` (`isOldGoldExchange`, number
  `EX-YYYY-NNNN` — the first gold-only ones were `OG-`; vendor = the
  customer, `exchangeInvoiceId` → the invoice); each line is an IN_STOCK
  KACHA stock row under a reusable "Bought from customer — <metal> <purity>"
  product (code `OLDGOLD-…`). Locked against edit/delete on Purchases.
- **Money**: one CREDIT `OLD_GOLD_EXCHANGE` on the customer for the full
  value, keyed by `purchaseId`, **not** `invoiceId` — cancelling/deleting
  the invoice leaves that value as store credit (the goods stay in stock).
  Applied first (after store credit), then cash covers the rest
  (`splitOldGoldValue`); the applied part is in `Invoice.paidAmount`.
  Excess: `STORE_CREDIT` (nothing else posted — the customer's balance goes
  negative = available credit) or `PAID_OUT` (a customer-only DEBIT
  `PAYMENT_OUT`, which `getPaymentsOut` now lists). Stored on
  `Purchase.oldGoldAppliedAmount/ExcessAmount/ExcessMode`.
- **Menu**: Purchases → "From Customers" (`/purchases/exchanges`, gated by
  the Purchases module); Purchases became a parent with "Purchase Bills".
  The sidebar's module filter prefix-matches like middleware. The invoice
  detail page shows a "Bought from customer" card with the net payable.
- **Sale side**: a new sale line ("Create New Line Item") now asks the same
  stone question first, at the top of its New product details, with the
  stone panel under it; a linked piece shows its stone toggle locked.
- **2026-10-05 — everywhere**: printed on all five invoice templates + the
  PDF (`PrintExchangeRows`: "Less: Bought from customer", "Net payable";
  Received/Paid = cash only via `cashReceived`). **Edit Invoice** can add an
  exchange when there is none (applied against what's still unpaid; the
  revision's own ledger delta excludes it so the customer isn't credited
  twice); an existing one shows read-only. **Estimates (Kacha)**: full
  exchange (`Purchase.exchangeKachaInvoiceId`, migration
  `20261005140000_exchange_kacha_quotation`); Kacha→Pakka also sets
  `exchangeInvoiceId`. **Quotations**: `Quotation.exchangeEstimate` (JSON —
  lines + values at quote time) buys nothing; the convert screen asks
  "Customer is handing over this old gold now" and, if ticked, records the
  real exchange on the new invoice with today's values.

### Added 2026-10-03: pieces made of several metals and stones

One ornament can be e.g. Gold 22K + Silver 925 + a Diamond. A line asks
**"Made of more than one metal or stone?"** (`components/shared/multi-part-question.tsx`)
on a New Invoice line (top of New product details), a Purchase line and a
Customer Exchange item; on → `PieceComponentsEditor`
(`components/shared/piece-components-editor.tsx`): one row per metal
(purity, gross/net, rate per gram, GST) and per stone (stone, type, carats,
weight, rate per carat, value, GST).
- **Data**: `PieceComponent` (migration `20261003100000_piece_components`)
  under `InvoiceItem` / `PurchaseItem` / `InventoryStock` (cascade). The
  **parent row is a summary**: first metal's metalTypeId/purity, netWeight
  = all metals, stoneCharge = all stones (× qty on a sale/purchase line,
  per piece on stock), `rate` null, and **fineWeight = only the first
  metal's own pure weight** so a reader grouping by the parent's metal never
  counts silver as gold.
- **Maths** (`lib/piece-components.ts` client preview; `getPieceResolver`
  in `lib/piece-components.server.ts` recomputes, validates against the
  store, snapshots GST): sale/purchase value metals on net × rate
  ("net"), Customer Exchange on pure weight × pure rate ("fine", less the
  item's deduction, no GST). GST per row at its own rate; making/HM at the
  line's rate. Line GST amounts are still taken from the form (same trust
  model as single lines).
- **Stock**: the rows go onto the stock row; selling a multi-part stock
  piece brings its rows (physical facts locked server-side from the stock's
  own rows; rates/GST from the form). A manual multi-part line mints its
  Product with one ProductMetalComponent per metal + ProductStoneComponent
  per stone. Purchase: picking a product with >1 metal or >1 stone comes in
  multi-part (fixes the old bug where such a product's stock stored the
  SUMMED weight under its first metal).
- **Reports**: anything grouped by metal uses `metalBreakdown(row)` (sales by
  metal, metal-wise report, metal daily ledger, dashboard metal cards —
  those widen their filter to `components: { some: { metalTypeId } }`);
  all-metals totals use `fineOrNet` with `pieceMetalsSelect` selected.
- **Display**: `PieceBreakdown` under the item on the invoice detail table
  and every invoice / Kacha / Quotation print template (`showGst={false}` on
  Kacha, which has no GST); purchase detail lists the rows. Thermal prints
  say "rate per row".
- **2026-10-05 — Kacha slips and Quotations too** (migration
  `20261005100000_piece_components_kacha_quotation`: PieceComponent
  `kachaInvoiceItemId` / `quotationItemId`). Same question + editor; each
  action file has its own copy of `resolvePieceLines`. Kacha rows carry no
  GST of their own except a linked stock piece's (kept, hidden on the slip);
  Kacha→Pakka and Quotation→Invoice copy the rows to the InvoiceItem and tax
  each at its own rate (fallback: the rate picked on the convert form),
  making/HM at that rate. Converted slips/quotes' convert pages redirect to
  the new invoice.
- **Printed rate-wise GST summary** (`gstRateGroups`, `lib/invoice-gst-summary.ts`,
  all four A4 invoice templates): a multi-part line's tax is split to each
  row's own rate, making/HM (+ rounding) to the line's; its per-line GST cell
  says "(mixed)".
- **Quick edit** (invoice detail "Edit rate/weight"): a multi-part line edits
  each row's rate (and a stone's value); weights fixed; `updatePieceLineItem`
  re-taxes per row and shifts invoice totals by the line's delta.
- % making charge on a multi-part line is on its metals' value
  (value per gram × net), on Invoice/Kacha/Quotation.

### Fixed 2026-10-05: Estimate/Quotation → Tax Invoice tax

`lib/conversion-gst.ts` (`conversionGst`) is the ONE computation of a
conversion's GST — used by `convertKachaToPakka`, `convertQuotationToInvoice`
and both convert screens' previews, so the preview is what's saved. Per line:
metal × **quantity** (it used to ignore quantity, under-taxing any line of
more than one piece) + making + HM + stone at the picked rate; a multi-part
piece row by row at each row's own rate (fallback: the picked rate). The
document discount is NOT taken off the tax base — same convention as a
direct invoice (invoice-form's taxableValue); the quotation preview used to
subtract it. The quotation convert screen shows the rounded total, its
Round Off line, and a balance against the rounded total. Hand-typed
multi-part Kacha rows now carry a "GST if billed" rate (store default;
hidden on the slip). Invoice/Kacha/Quotation/Purchase exports have a
"Metals & Stones" column (`lib/piece-components-text.ts`).

### Added 2026-10-06: Today's Rates chip in the top bar

`components/dashboard/rates-chip.tsx` shows the active store's selling rates and lets
the Store Owner edit them without opening Settings. It reads and writes the **same
columns Settings > Taxonomy does** — `StoreMetalPurity.sellingPrice`,
`StoreMetalOrigin.sellingPrice` (stone types), `StoreMetal.sellingPrice` for a metal
with neither — so billing picks the change up directly. Read: `lib/selling-rates.ts`
(server-only helper, called by `app/(dashboard)/layout.tsx` with the session's store —
deliberately not a server action, so a client can't pass another storeId). Write:
`updateSellingRates` (`lib/actions/selling-rate-actions.ts`), gated on the role in the
**active store** (`getEffectiveAccess`), one transaction, every id matched by
`{ id, storeId }`. Hidden for KARIGAR. Its two reads are **cached per store** (`unstable_cache`, tag `sellingRatesTag(storeId)` in `lib/cache-tags.ts`, 5-min TTL as a backstop) because the layout renders on every page load; every action that changes a rate, metal, purity or stone type (rates chip actions + the 13 Settings › Taxonomy saves/imports) calls `updateTag(sellingRatesTag(storeId))` — add that call to any new action that changes them, or the chip shows a stale rate. The popover lists exactly the store's active Settings purities / stone types (no fixed list — an earlier "add standard purities" link was removed after it duplicated a store's own "18" as "18K"); "+ Add purity / stone type" adds one there with its first rate, and the header shows when and by whom rates last changed.

**Two kinds of rate, kept apart (user decision 2026-10-06):** `MetalRate` is the
*market* rate — fetched by `/api/cron/metal-rates` (goldapi.io; more APIs planned) and
copied to every store, a reference only. The *selling* rate per purity (24K, 22K, …)
is always the Store Owner's own. Every change to it, from the chip or from Settings'
purity / stone-type save (`saveWithRateHistory` in `taxonomy-actions.ts`), appends a
`SellingRateEntry` (migration `20261010100000_selling_rate_entries`; label/unit
snapshotted) in the same transaction, via `recordSellingRateChange`. Metal Rates shows
it as "Your Selling Rates" above the "Market Rates" table. Store export and Force
Delete include the table (its FK is RESTRICT). Don't make a market API fill the
selling price. Spec: `e2e/header-rates.spec.ts`.

### Changed 2026-10-07: Purity & Carat page retired; placeholder silver cleared

- `/settings/purity` now redirects to `/settings/taxonomy`; the tab and its two forms are gone. `PurityFineness` / `CaratConversionRate` rows remain only as the fallback for very old records with no store purity (`lib/purity-db.ts` `getFinenessMap`) — don't build new UI on them.
- `MetalRate.silver` is nullable (migration `20261014100000_metal_rate_silver_nullable`): the cron used to store a hard-coded ₹120; the migration cleared those values (silver = 120 and before 2026-10-08, all stores — gold columns kept). The cron now fetches XAG/INR and falls back to the last non-null silver, else null. Every reader treats null as "unknown" (table shows —, billing gets no silver fine-rate suggestion).

### Added 2026-10-07: every icon-only control has a tooltip

- An icon-size `<Button size="icon…">` with an `aria-label` gets a styled tooltip automatically (`components/ui/button.tsx`; skipped when the button shows its own text, e.g. calendar days). Anything else icon-only (raw `<button>`, `<Link>`, a `size="sm"` icon button) is wrapped in `<IconTooltip label=…>` (`components/ui/icon-tooltip.tsx`); for an `asChild` trigger wrap the outer element.
- Label icon-only controls with `aria-label`, not `title` — Button drops `title` so tooltips don't double, so e2e must locate by role + name, never `getByTitle`. `e2e/icon-tooltips.spec.ts` crawls the main pages and fails on any unlabelled icon-only control.
- The data-table search (`CollapsibleSearch`) is never disabled while the list reloads (a disabled input drops focus); it shows a spinner instead. Products search also matches any stone's IGI / certificate no.; Stock search matches product code and the IGI no. on the piece's or its product's stones.
- Searchable selects use `SelectSearchInput` (`components/ui/select-search-input.tsx`), which keeps the cursor in the search box (Radix Select otherwise moves focus to its items).

### Added 2026-10-07: purity duplicates refused; fineness warning can be ignored

- `purityLabelKey` (`lib/purity-label.ts`): "18" = "18K" = "18 kt" = "18 karat" (a bare number ≤ 24 is karats; 925/999 stay millesimal). The Settings purity form, the rates chip "+ Add purity" and the taxonomy Purities import compare by it — Mangal Jewell had both "18" and "18K". `scripts/merge-purity.ts "<store>" <metal> <from> <to> [--apply]` merges an existing duplicate for one store (dry run by default); **not yet applied to Mangal on production** (needs the owner's go-ahead: 69 products / 70 product metal rows / 69 stock pieces use "18", no bills).
- "Ignore" on the "looks wrong" fineness warning stores the kept value in `StoreMetalPurity.finenessCheckIgnoredAt` (migration `20261013100000_purity_fineness_ignore`); the warning stays hidden while `finenessPercent` equals it and returns if the fineness changes.

### Added 2026-10-07: Settings › Weights (net / fine weight calculation per store)

Migration `20261012100000_weight_calculation_settings` (additive, defaults = previous behaviour, no data change). `BusinessSettings` gains `netDeductStoneWeight` / `netDeductDmoWeight` (net = gross − stone − DMO by default), `fineWeightBasis` (NET default, or GROSS — falls back to net without a gross), `addWastageToFineWeight` (off), `weightDecimalsGram` / `weightDecimalsCarat` (3). `StoreMetalPurity.wastagePercent` is a per-purity default copied onto lines (`wastagePercent` on InvoiceItem, KachaInvoiceItem, QuotationItem, PurchaseItem, PieceComponent; InventoryStock already had it) and stays editable; it's only added to fine (net × (fineness + wastage)%) when the toggle is on.
- **`lib/weight-calc.ts` is the only calculator** (pure, client-safe: `deriveNetWeight`, `calcFineWeight`, `formatWeight`); `lib/fine-weight.ts` resolves it per store (`fineOf.line()`, `storedLineWeights`, `deriveNet`). Any new write path must use these. Forms read settings via `useWeightSettings()` (dashboard layout, cached per store under `weightSettingsTag`).
- **Changing them needs a confirmed recalculation** (`lib/weight-recalc.server.ts`): dry-run counts → confirm → client-driven batches of 500 with a cursor in `BusinessSettings.weightRecalcJob` (resumable, row-locked), **strictly the acting store, Store Owner only, never automatic**. Fine weight is recomputed everywhere it's stored (+ "Stock added" ledger entries still equal to the piece's old figure); net weight only on unsold single stock pieces and unlinked lines of DRAFT estimates / open quotations, and only where the stored net still equals the old derivation (hand-typed nets are kept). Issued / paid / converted documents keep net, amounts and GST. Runs are logged in `BusinessSettings.weightRecalcLog` (newest 20) and shown as History. e2e proves another store's rows stay byte-identical.
- Weights on screen, in reports and in text exports use `weightFormatter` (`lib/weight-calc.ts`): `useWeightFormat()` on the client, `getWeightFormat(storeId)` / `getActiveWeightFormat()` on the server (cached per request), `<WeightText>` in shared components. **Never `toFixed(3)` a displayed weight.** Stone-row carats show at most 2 decimals; other carats use `weightDecimalsCarat`. Report exports round weight cells; re-importable sheets and ledger exports keep exact stored values; ledger descriptions already saved keep 3 decimals. Dashboard metal-stock KPIs show the store's decimals (were 1). Karigar issue/receipt keep their own wastage maths.

### Fixed 2026-10-06: picking a stock piece brings every metal and stone

Add Stock (and the stock import) store only the Product's first metal / first stone on the stock row and write no `PieceComponent` rows, so a multi-part piece used to open on a sale as one metal + one stone (no pcs, no stone rate) and the save collapsed it again. Now:
- Rows come from `stockPieceComponents` (`lib/inventory/stock-piece-rows.ts`): the piece's own PieceComponents, else its Product's metal/stone rows when it has more than one of either. All three `resolvePieceLines` (invoice / kacha / quotation) lock the same rows via `lockedStockPieceRows` — never read `stock.components` directly for a sale.
- Pick rates (`lib/inventory/stock-pick-rates.ts`, shared by Invoice, Kacha, Quotation and the invoice scan path): stone = piece/Product stone rate → Stone Type selling price → stone metal's; metal = purity selling price → metal's → fine rate × fineness.
- Stone pcs / clarity / certificate **are saved** (migration `20261011100000_stone_piece_details`): `PieceComponent.pieces/clarity/certificateNumber` and `stonePieces/stoneClarity/stoneCertificateNumber` on InvoiceItem, KachaInvoiceItem, QuotationItem. Validated by `parseStoneDetails` / `resolveLineStoneDetails` (`lib/piece-components.server.ts`), shown via `LineStoneDetails` / `PieceBreakdown` / `stoneDetailsText` on detail pages and all 15 print templates, copied on Estimate/Quotation → Invoice. On a stock piece a value it already records is read-only. The invoice line quick edit also corrects them (single-stone line and each multi-part stone row) — invoice-only, never the stock piece; a details-only quick edit doesn't re-price (re-saving used to drift the total by ₹0.01 and post a revised ledger entry). Purchase and Customer Exchange suggest the Stone Clarity list too.
- Add Stock and the stock import write a multi-part Product's rows (`newStockPieceRows`): the entered net weight and carats are split in the Product's proportions; one stock-added ledger entry per metal. Editing an Add Stock piece's weight re-splits its rows only when they still exactly match the Product's proportional split, the piece isn't locked by a sale/estimate/artisan job and has no Purchase or artisan-receipt origin (`planStockPieceRowsEdit`); other rows (and their fine weight / stone value) are left alone. Stock edits never post to the ledger.
- The Settings → Tags preview is a hard-coded sample tag, not real piece data.

### Added 2026-10-06: Excel import/export overhaul

Every import template and its export now share **one column definition**, so an exported file is a filled-in template and re-imports cleanly (labels, not raw enums; plain numbers, not "₹ 1,000"); export-only computed columns sit at the ends and imports ignore them. Each template has an Instructions sheet and store-scoped dropdowns. Imports are **all-or-nothing** (one transaction) and run the same rules as the Add/Edit form. Exports call `assertPlanActiveForExport`. Sheet definitions:

- Products / Stock: `lib/inventory/product-sheet.ts`, `stock-sheet.ts`.
- Parties: `lib/customers/customer-sheet.ts`. `validateCustomerInput(input, { gstScheme })` is the single rule set (GSTIN format + required for Regular/Composition, PAN, Aadhaar, email, 6-digit pincode); State/City checked against the lists. **Edits only judge fields they change** (`updateCustomerCore`), so a party saved before these checks stays editable. Suppliers page exports suppliers only.
- Artisans: `lib/karigars/karigar-sheet.ts` (old headers still read via aliases). Mobile/email unique within the file, across the store's artisans and every user login; artisan edit only checks a mobile it changes. Location-restricted users import/create under their own locations (`resolveWritableLocationId`). Ledger export: Source with the artisan's name, Issued By, payment-method labels, opening balances.
- Estimates (Kacha): `lib/billing/kacha-sheet.ts` + `kacha-sheet-rows.ts`, one row per line grouped by Slip Ref, shared by template, export and the delete-all backup. Import writes through `writeKachaSlip` (the form's path), so it posts the SALE debit and payment credits; purity uses the store's labels; Purchased From required. Restore keeps a free `KACHA-YYYY-NNNN`, skips re-posting when "Estimate X balance due" is still on the ledger (no `kachaInvoiceId` on LedgerEntry), relinks Converted To Invoice. Slip numbers now count on from the highest used number.
- Settings taxonomy: `lib/inventory/taxonomy-sheet.ts` — Metals + Purities + Categories file, Stones + Stone Types file, with exports. Existing names are **updated**, new ones added, nothing deleted; metals and stones share one name space. Selling prices live only on Purities / Stone Types; every change logs a `SellingRateEntry`.
- Ledger export returns every match for the page's filters (`lib/ledger-filters.ts`; the page itself still loads 500). Document exports: invoice GST split, offer, old-gold exchange, location, e-way/IRN; status labels from `lib/status-labels.ts`.
- **Sheets follow the store's settings.** `getSheetFeatures(storeId)` (`lib/sheet-features.server.ts`) reads the flags once per request; a sheet column with a `feature:` (helpers in `lib/sheet-features.ts`) is left out of the template, export, Instructions and dropdowns while it's off, and imports drop it from uploaded rows (an old file is never an error; stored values are never touched). Today: Style (`styleFieldEnabled`), E-way Bill / IRN, Artisan Job (`sendToArtisanEnabled`), Location (store has any location), GST Rate columns (store has any GST rate). Add a new optional column by giving it a `feature`, not an if in one action. The delete-all Estimates backup keeps every column (it's a restore file). Columns are auto-sized to their content (`autoFitColumns`).
- Row errors carry a "did you mean / already saved as / first used on row N" hint (`lib/import-suggest.ts`, shown by `components/shared/import-error-list.tsx`).

Same pass: store data export covers every store-scoped table and Force Delete Store deletes the RESTRICT-FK tables it missed (styles, clarities, promotions — it failed for every store). **Check `pg_constraint.confdeltype`, not the schema, before adding a model to either list.** Users export honours format/selection. Credit notes and draft orders are location-scoped like invoices (list, detail, export, mutations).

**Forms: handle a successful save inside the action, not in an effect on `useActionState`'s state.** A save that revalidates can suspend and remount the form (New Purchase sits in `<Suspense fallback={null}>`), and the remounted form never sees success — the purchase was saved but the user was left on a blank page (flaky `multi-part`/`offers` specs, fixed in `purchase-form.tsx`, `offer-form-dialog.tsx`, `vouchers-sheet.tsx`, `invoice-items-table.tsx`). Other forms still use the effect pattern; convert them if they show the same symptom.

Settings → QR & Barcode Tags: printed fields can be dragged to reorder, chips dragged in, rows dragged out (native DnD; handlers read a ref because dragover outruns React re-renders).

### Added 2026-10-06: Offers & gift vouchers (promotional sales)

`Promotion` + `PromotionVoucher` (migration `20261006100000_promotions_vouchers`).
An offer is PERCENT_OFF / FLAT_OFF (target BILL or MAKING_CHARGES, optional
maxDiscount) or BUY_X_GET_Y (cheapest Y of every X+Y pieces at
getPercentOff, 100 = free), with optional min bill, validity dates,
category/metal filters, total and per-customer usage limits. Redeemed by the
offer's public `code` or a single-use voucher code (optionally tied to one
customer, optional expiry). Admin: Billing → Offers & Vouchers
(`/billing/offers`, `lib/actions/promotion-actions.ts`).
- **Maths** `lib/promotions.ts` (`computePromotion`, client-safe) is shared
  by the New Invoice preview and `createInvoice`. The discount is spread over
  the eligible lines and rides on each line's `schemeDiscount` (so it's
  **before GST** — a discount on the invoice reduces the value of supply);
  the line payload also carries `promoDiscount` so the server can separate
  it. A multi-part line scales every part's taxable value by the same factor.
- **Server** `resolveInvoicePromotion` (invoice-actions.ts) re-checks the code
  via `lookupPromotionCode` (`lib/promotions.server.ts`: active, dates,
  limits, voucher unused/unexpired/right customer), recomputes, and refuses if
  the form's per-line figures differ by > ₹0.05. Invoice keeps
  `promotionId/promotionCode/promotionDiscount`; a voucher is spent in the
  same transaction with a conditional `usedAt: null` update (no double use).
  Cancel/delete frees it. Prints and the detail page label the discount
  "(incl. offer CODE)".
- New Invoice only (Edit Invoice keeps the discount already on the lines;
  not on Kacha/Quotation yet).

### Regression tests (added 2026-09-29)

Playwright suite in `e2e/`, run by `.github/workflows/regression.yml` on every push to `main` and every PR: throwaway Postgres in the runner → migrate → `pnpm seed` + `pnpm db:seed:full-demo` → `tsc` → `pnpm build` → `pnpm test:e2e`. Sign-in mints a NextAuth JWT in `e2e/global-setup.ts` (no test login route in the app), which also refuses any non-localhost `DATABASE_URL`. See `e2e/README.md`. **Add a spec for every new feature.** The demo seed must keep creating `UserStoreMembership` rows for its users — `requirePermissionInStore` (createInvoice etc.) reads only that table, so without them the demo Admin can open every page but not save an invoice. Tests run in parallel with Vercel's own deploy on a direct push to `main`; they only *block* a bad change if work goes through a PR (or Vercel's deployment checks are turned on).

### Known dead/pre-existing issues (not regressions — don't "fix" without reason)

- `auth.config.ts` (repo root) and `app/api/auth/route.ts` are orphaned NextAuth v5-style leftovers, not wired to anything (`app/api/auth/[...nextauth]/route.ts` is the real handler). Both have their own pre-existing type errors.
- `components/customers/edit-customer-dialog.tsx` references `Customer.alternatePhone`/`addressLine1`/`gstin` — the `Customer` type exported from `lib/actions/customer-actions.ts` uses different field names (`altPhone`/`address`/`gstNumber`), a pre-existing mismatch, not something recent work introduced.
- `components/customers/ledger/add-customer-ledger-entry-dialog.tsx` imports `initialCustomerLedgerFormState`/`CUSTOMER_LEDGER_ENTRY_TYPES` from `lib/constants/customer-ledger`, which doesn't export them.
- `components/dashboard/metal-price-chart.tsx` has a `recharts` `Formatter` type mismatch on a tooltip formatter.
- `components/inventory/stock/stock-row-actions.tsx` imports `./delete-stock-button`, which doesn't exist — dead code, not imported anywhere itself, so it doesn't break the build.
- One implicit-`any` parameter in `app/(dashboard)/billing/[id]/page.tsx`'s items-map callback.
- None of these are caused by the multi-tenant/permissions/taxonomy/purchase/quotation work across this project's history — check `git blame` before assuming a change introduced them. (`components/inventory/products/product-form.tsx` and `components/inventory/stock/stock-create-form.tsx` used to be on this list from an earlier pass but are now clean — don't re-add them without re-checking `tsc --noEmit` first, this list drifts easily.)

### Added 2026-10-02: picking a stock piece fills its catalog details on every sale form

`lib/inventory/stock-option-details.ts` (`stockOptionProductDetailsSelect` + `toStockOptionProductDetails`) is spread into every sale form's stock list (`getInvoiceFormStockItems` — also Kacha's — and `getQuotationFormStockItems`), so each option carries the Product's Category/Type/Style, its per-Metal Purity label, the first Metal row's GST Rate and its default Making Charge. On pick, the stock row's own value wins and the Product's fills the gap (`stockCatalogFields` in `invoice-form.tsx`; same precedence inlined in Kacha/Quotation). Linked lines show Category/Type/Style read-only via `components/inventory/shared/linked-product-details.tsx` — on Invoice inside a "Product details" box that mirrors the "New product details" box of a Create-New line. `StockItemSelect` shows and searches `categoryName`. Extend the shared helper, not one form, when a picker needs another catalog field.

### Added 2026-10-05: stock pick auto-fill gaps, configurable QR/Barcode tags, fine weight in lists

- **Purity cleared itself on pick (all five purity pickers).** Radix Select fires `onValueChange("")` when its `value` lands before that option has rendered — purities load async per metal, so picking a stock piece set `purityLabel` and the loading Select then wiped it to "None". Every `selectPurity` handler (invoice, kacha, quotation, purchase, karigar receive) now ignores `""` — an explicit "None" pick is `"__none__"`. Watch for the same trap on any other async-options Select.
- **A linked piece's stone** counts as present from its carat/stone weight, stone name or `Product.hasStoneComponent` (`stockHasStone`), not only when a stone rate was recorded.
- **Rate / g fallback**: after the piece / purity / stone-type / metal Selling Prices, a picked piece is priced at today's Metal Rates board (24K gold / silver) × the purity's fineness (`stockSellingRate`, `StockOptionProductDetails.purityFineness`). Invoice only so far (Kacha/Quotation still stop at the configured prices). GST Rate and Making Charge stay blank when neither the stock row nor the Product has them — that's missing store setup, not a pick bug.
- **Tags**: `getStockTags` (`lib/actions/inventory/stock-tag-actions.ts`, replaces `getStockBarcodeTags`) returns every metal (multi-part rows, else the single metal) and every stone (with pieces/clarity/certificate from the Product's matching row). Which fields print, in order, is `BusinessSettings.qrTagFields` / `barcodeTagFields` (migration `20261008100000_stock_tag_fields`, keys in `lib/stock-tag-fields.ts`), edited at Settings → QR & Barcode Tags with a live preview; `stockTagLines` renders them for both labels and shrinks the font as lines grow. The QR still encodes only the `/s/<id>` scan link and the barcode only the tag code — putting details *in* the code would break scan-to-sell.
- **Lists**: Stock shows Product Code over `STK-… (qty)` in one column (no separate Qty or Product Code column), plus Fine Weight (stored `InventoryStock.fineWeight`, summed in the footer). Products shows Fine Weight computed in `getProducts` via `getFineWeightResolver` (Product has no fine-weight column). Stock detail hides the Source / Extra Details card when every field is empty.

### Fixed 2026-10-09: stones count as stock, not only metals

- A stone is kept on a stock row / purchase line **by name** (`stoneMetalTypeName` + `caratWeight`), or as STONE `PieceComponent`s on a multi-part piece; a loose stone's stock row has `metalTypeId: null`. So the dashboard's per-metal stock cards (by `metalTypeId`) never counted any stone. `stoneBreakdown(row)` (`lib/piece-components.ts`) is now the one reader: STONE components if present, else the row's own stone — never both (the parent's caratWeight is a summary). Gemstone (`isGemstone`) cards total carats from loose + set stones and show "ct".
- Supplier Ledger "Metal Purchased" used to take a line's metal **or** its stone; a gold piece with a stone now lists both, and multi-part lines list each row.
- Not done: the Metal-wise report and metal daily ledger still ignore set stones (their reconciliation is per metalTypeId, in grams).
- Rich row tooltips open beside the row (`side="left"` on the Supplier Ledger date, `side="right"` on FinishBadge) so they don't cover the table.
