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

Every store gets 3 default `StoreMetal` rows ("Gold"/"Silver" with `hasPurity: true`, "Other" with `hasPurity: false`), 6 default `StoreCategory` rows, and 16 default `StoreCategoryType` rows under "Ornament" (mirroring the old enum's values) — seeded once via a backfill script when this migration ran, **not** lazily per-store the way `BusinessSettings`/`PurityFineness` are; a brand-new store created after this migration has no analogous auto-seed step yet, so check whether `createStoreWithAdmin` (`lib/actions/store-actions.ts`) needs one before assuming every store always has these three tables populated.

**Purity/fineness deliberately did not become configurable in the same way** — `PurityType` (24K/22K/etc.) and `PurityFineness` are unchanged, and only apply to metals with `StoreMetal.hasPurity: true`. This was an explicit scope decision (asked and confirmed), not an oversight — don't assume a custom metal like "Platinum" needs its own purity/fineness table without checking whether that's actually been requested, since building one is a materially bigger change (it touches every fine-weight calculation in the Karigar ledger and Gold Flow report).

The Category→Type picker (`components/inventory/products/product-form.tsx`) cascades the same way the existing Customer form's State→City picker does (`getStoreCategoryTypes(categoryId)` fetched client-side on category change) — but unlike City (which submits a free-text name), Type submits a real FK id, so the Type `<select>` is controlled, not the City pattern's uncontrolled `defaultValue`.

### Ledger

`/ledger` (`app/(dashboard)/ledger/page.tsx` + `components/ledger/ledger-tabs.tsx`, labeled just "Ledger" in the UI — it covers every configured metal, not only gold/silver) reads real, store-scoped `LedgerEntry` rows via `lib/actions/ledger-actions.ts`'s `getLedgerEntries()` — it is not backed by mock data (an earlier version was; `lib/data.ts` was deleted when it was rewired). The "Ledger Entries" tab (`components/ledger/ledger-view.tsx`) is client-side paginated (20/page) on top of an already-fetched batch (capped at 500 rows) with client-side filters — there is no server-driven pagination here, unlike `KarigarsPagination`'s URL-param-driven approach used elsewhere. This is the general cross-account ledger; a single karigar's ledger with running fine-gold/cash balances is a separate, from-scratch computation — see "Karigar Ledger" above, don't conflate the two.

A second "Metal-wise" tab (`components/ledger/metal-daily-ledger.tsx`, data from `getMetalDailyLedger()`) shows a day-by-day Gold/Silver/Diamond purchased/sold breakdown with a running closing balance per metal. **This is deliberately not built from `LedgerEntry`** — a SALE/PURCHASE `LedgerEntry` only ever carries a money balance-due amount (see `recordInvoicePayment`/`createInvoice` in `invoice-actions.ts`), never metal weight or type, and is only created at all when a balance is outstanding (a fully-paid invoice logs no `LedgerEntry`). So `getMetalDailyLedger()` instead aggregates `PurchaseItem`/`InvoiceItem`/`KachaInvoiceItem` directly (same source tables `getMetalWiseReport()` in `report-actions.ts` uses for its all-time-total version of the same breakdown), grouped by day and classified into GOLD/SILVER/DIAMOND via `classifyMetalName()` — same fixed-family convention as `getLedgerTotals()`'s `unitTotals`, not the fully-configurable `StoreMetal`-row model `getMetalWiseReport()` uses. A metal not in the store's configured Business Units (Settings → Business Units) is silently dropped from this view even if `StoreMetal` rows/transactions for it exist, matching `getLedgerTotals()`'s existing behavior — not a new gap introduced here.

**Diamond is carat-based, not money-based.** Diamond used to be tracked in the Ledger as a rupee-equivalent value (`BusinessUnit`'s `DIAMOND` fell through `formatUnitValue`'s default ₹ branch, and `LedgerEntry`/manual customer-ledger entries stored a Diamond transaction's `amount` instead of a quantity). This was changed so Diamond is quantity-based like Gold/Silver, just in carats instead of grams: `lib/business-units.ts`'s `CARAT_BASED_UNITS` (parallel to `WEIGHT_BASED_UNITS`) drives `formatUnitValue`'s "X.XXX ct" branch; `LedgerEntry.caratWeight` (`Decimal(10,3)`, migration `20260902200000_add_ledger_entry_carat_weight`) holds the quantity for a Diamond entry, mirroring how `metalWeight`/`metalWeightFine` hold it for Gold/Silver; `getLedgerTotals()`/`getCustomerLedgerSummary()`'s per-unit totals and `getMetalDailyLedger()`'s `valueFor()` all read `caratWeight` (or the relevant `PurchaseItem`/`InvoiceItem`/`KachaInvoiceItem.caratWeight` column) for the DIAMOND case instead of `amount`; and the manual "Add Sale Entry"/"Add Refund Entry" dialogs (`components/customers/ledger/`) now ask Diamond for a metal type + carat quantity, the same shape as Gold/Silver's metal type + gram weight, instead of a bare ₹ amount. **Not changed**: the Karigar issue/receive-material flow (`lib/actions/inventory-stock-actions.ts`, `issueMaterialToKarigar`/`receiveItemsFromKarigar`) still measures a Diamond job in the same weight (grams) fields as Gold/Silver (`KarigarJob.issueWeight`/`receiveWeight`) — converting that to carats would also touch the wastage-percent fine-weight reconciliation math described above and wasn't part of this change; flag it for a deliberate decision before touching.

Both the Ledger (`/ledger/export`) and Reports (`/reports/export`) pages export to CSV/XLSX via `<ExportMenu>` (`components/shared/export-menu.tsx`) hitting a route handler that re-calls the same `lib/actions/*.ts` functions the page already renders from, so exported rows can never drift from what's on screen. `lib/excel-export.ts`'s `buildCsvExport`/`buildExcelExport` are the shared row→file builders — use them for any new export route instead of hand-rolling XLSX/CSV again (the pre-existing `customers/export`, `vendors/export`, and `metal-rates/export` routes each still hand-roll their own, left as-is).

### Fixed 2026-09-03/04: Making Charge / stone-weight staleness, plus a UI convention worth reusing

Two related "stale derived value" bugs, both in per-line-item pricing on Invoice/Kacha forms:

- `MakingChargeInput`'s percent mode computed a flat ₹ amount from `rate × netWeight` only at the moment the percent field itself was typed, and never re-derived it when `rate`/`netWeight` changed afterward — a corrected metal rate silently left Making Charge (and the whole invoice total) frozen at a stale, wrong figure while the "= ₹X" hint kept recalculating live and looked correct. Fixed with a `useEffect` keyed on `[mode, percent, metalValue]` that re-emits the resolved amount whenever the base changes while in percent mode. The same pattern was generalized into a new `components/shared/percent-or-flat-input.tsx` (`PercentOrFlatInput`, taking a plain `base: number`) used for the whole-document **Discount** field on Invoice/Kacha/Purchase/Quotation — built with the staleness fix from day one.
- `netStoneWeightTouched` was being set unconditionally to `true` whenever a stock item was linked to a line (meant to protect a stock's real recorded `stoneWeight` from being overwritten by the Carat-Weight auto-fill), even when that stock had no real weight recorded (`0`/`null`) — permanently blocking Net Stone Weight's auto-fill for stones added after the fact. Fixed in `invoice-form.tsx` (`applyStockToItem`, `addScannedStock`) with a conditional check on the stock's actual recorded value; fixed unconditionally to `false` in `kacha-invoice-form.tsx` since its `StockOption` type never carries `stoneWeight` at all.

**Lesson for any new "compute X from Y, but let the user override X" field**: the derived value must react to every input it depends on via `useEffect`, not just its own field's `onChange` — recompute-on-own-change-only is the bug shape to watch for, and a live-updating hint label next to a frozen stored value is exactly the kind of thing that looks correct in a screenshot while being wrong underneath.

### Stone pricing: one section owns the whole thing

`components/inventory/shared/stone-component-fields.tsx` (`StoneComponentFields`) used to render only the Stone/Stone-Type picker; it now renders the picker **and** Carat Weight, Stone Rate, Stone Charge, and Net Stone Weight together as one grouped section, so Invoice/Kacha/Product-form line items all get the same layout and the same Carat→Net-Stone-Weight auto-fill instead of three independently-drifting implementations. Its prop surface grew accordingly (`caratWeight`/`onCaratWeightChange`, `stoneRate`/`onStoneRateChange`, `stoneCharge`/`onStoneChargeChange`/`stoneChargeTouched`, `stoneWeightInput`/`onStoneWeightInputChange`/`stoneWeightUnit`/`onStoneWeightUnitChange`/`netStoneWeightTouched`, in addition to the original picker props) — check the current component before wiring a new caller rather than assuming last-seen props still match.

### Search + "Add new" inside a `<Select>`

The pattern (first built for the Stone picker, now also on Location, and on Product-form's Category/Type/Metal Type/Default Purity) is a plain `<Input>` inside a `<div className="p-2">` at the top of `SelectContent`, filtered client-side via `useMemo`, with `onKeyDown={(e) => e.stopPropagation()}` — without that stop, Radix Select's own keyboard nav steals the search box's keystrokes. "Add new" is a small `Dialog` + `useActionState`, appending the created row to local state via an `onCreated` callback (see `AddMetalDialog`, generalized from the old stone-only `AddStoneDialog` via an `isGemstone?: boolean` prop; `AddCategoryDialog`/`AddCategoryTypeDialog` mirror the same shape). Default Purity is search-only, no add-new, since `PurityType` is a fixed Prisma enum, not a store-configurable table.

### Hallmark Charge

`BusinessSettings.hallmarkChargePerPiece` (`Decimal @default(45)`) is a new store-level setting (labeled as a starting figure the store should verify against their own hallmarking centre, same "not authoritative, verify locally" convention as `PLACEHOLDER_TDS_THRESHOLD` in the sibling `taxfriend-boss` project). Auto-applied as `hmCharge` per line item on Invoice/Kacha/Quotation (not Purchase — a vendor's own HM charge is a different concept) whenever the line's purity is hallmarkable per `isHallmarkablePurity` (`lib/purity.ts`). `KachaInvoiceItem.hmCharge`/`QuotationItem.hmCharge` are new columns — only `InvoiceItem` had this field before.

### Invoice numbering is now date-based, matching the ticket number's shape

`generateInvoiceNumber` (`lib/actions/invoice-actions.ts`) changed from `{prefix}-{year}-{paddedCount}` (yearly-resetting counter) to `{prefix}-{YYYYMMDD}-{paddedDailyCount}` (daily-resetting), so an invoice number visibly encodes year/month/day instead of just a plain running count. Mirrors `SupportTicket.ticketNumber`'s existing `TKT-{YYYYMMDD}-{HHMM}-{seq}` shape, minus the time component (not asked for). **Purchase/Quotation/Kacha slip numbers still use the old `{prefix}-{year}-{count}` shape** — this was scoped to Invoice only; extending the others is an easy, not-yet-requested follow-up, don't assume it's already done.

### Sortable list columns: two different mechanisms, don't cross-wire them

Every server-paginated entity list (Products, Stock, Customers, Vendors, ...) sorts via `DataTableToolbar` (`components/shared/data-table-toolbar.tsx`) — a dropdown that manages `sortBy`/`sortOrder` as URL search params, feeding a Prisma `orderBy` built by that entity's own `get*OrderBy()` function (e.g. `getProductOrderBy`, `getStockOrderBy`). A nullable relation sorts via `{ relationName: { name: sortOrder } }` (e.g. `category`, `metalType`, `product`, `location`). This is a **different** mechanism from the Reports section's `SortableTh` (`components/reports/report-table-controls.tsx`), which sorts an already-fully-loaded dataset client-side by local React state with clickable-arrow headers — the two must not be conflated when extending either one. Products/Stock's sort option lists were both extended today (Category/Type/Metal/Purity/Net Weight/Status for Products; Stock Code/Product/Metal/Purity/Qty/Status/Finish/Location/Purchase Date for Stock) — adding another sort field to any entity means extending its `get*OrderBy` + its `sortOptions` array, nothing else.

### Known dead/pre-existing issues (not regressions — don't "fix" without reason)

- `auth.config.ts` (repo root) and `app/api/auth/route.ts` are orphaned NextAuth v5-style leftovers, not wired to anything (`app/api/auth/[...nextauth]/route.ts` is the real handler). Both have their own pre-existing type errors.
- `components/customers/edit-customer-dialog.tsx` references `Customer.alternatePhone`/`addressLine1`/`gstin` — the `Customer` type exported from `lib/actions/customer-actions.ts` uses different field names (`altPhone`/`address`/`gstNumber`), a pre-existing mismatch, not something recent work introduced.
- `components/customers/ledger/add-customer-ledger-entry-dialog.tsx` imports `initialCustomerLedgerFormState`/`CUSTOMER_LEDGER_ENTRY_TYPES` from `lib/constants/customer-ledger`, which doesn't export them.
- `components/dashboard/metal-price-chart.tsx` has a `recharts` `Formatter` type mismatch on a tooltip formatter.
- `components/inventory/stock/stock-row-actions.tsx` imports `./delete-stock-button`, which doesn't exist — dead code, not imported anywhere itself, so it doesn't break the build.
- One implicit-`any` parameter in `app/(dashboard)/billing/[id]/page.tsx`'s items-map callback.
- None of these are caused by the multi-tenant/permissions/taxonomy/purchase/quotation work across this project's history — check `git blame` before assuming a change introduced them. (`components/inventory/products/product-form.tsx` and `components/inventory/stock/stock-create-form.tsx` used to be on this list from an earlier pass but are now clean — don't re-add them without re-checking `tsc --noEmit` first, this list drifts easily.)
