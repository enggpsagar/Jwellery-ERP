# Regression tests (Playwright)

Runs automatically on every push to `main` and every pull request
(`.github/workflows/regression.yml`). A run:

1. starts a throwaway Postgres inside the GitHub runner,
2. applies every migration and seeds the demo store (`pnpm seed`, `pnpm db:seed:full-demo`),
3. type-checks and builds the app,
4. signs in as the demo Admin (`admin@aurumdemo.test`) and runs `e2e/*.spec.ts`.

No real secrets are used, and nothing talks to the shared Neon database —
`global-setup.ts` refuses to run unless `DATABASE_URL` points at localhost.

## What's covered

| Spec | Checks |
| --- | --- |
| `smoke.spec.ts` | Every main screen opens: no 5xx, no "Something went wrong", no browser error, no bounce to login |
| `billing.spec.ts` | A "Create New Line Item" invoice line creates its Product (with Metal + Category) + Stock and sells it to 0, recording its (required) Purchased From party on the stock row; a new line missing Category is blocked; quantity can't exceed stock |
| `source-party.spec.ts` | A hand-typed Kacha / Quotation line can't be saved without its Purchased From party; the party is stored on the line and shown on the detail page |
| `fine-weight.spec.ts` | 22K stock is backfilled at 91.6% fine; a 22K invoice line saves 9.16 g fine for 10 g on the line and its stock |
| `old-gold.spec.ts` | Customer Exchange: below/above the bill, stones, loose diamonds, printed exchange rows, adding one on Edit Invoice (no double credit), on an Estimate (kept through conversion), and a Quotation estimate that becomes real on conversion |
| `delivery-location.spec.ts` | New Invoice hides Delivery Location when Settings has none picked; shows it once one is |
| `multi-part.spec.ts` | One piece of gold + silver + diamond on a sale line (per-row value & GST, gold-only pure weight on the line, stock + product breakdown, printed 1.5% GST group, per-row quick edit), a Customer Exchange item, a purchase line, and Kacha / Quotation lines that keep their rows when converted to an invoice |
| `purity-check.spec.ts` | A 22K purity saved at 100% is flagged in Settings and fixed to 91.6% in one click |
| `conversion-gst.spec.ts` | Converting a 2-piece Estimate / Quotation line taxes both pieces (preview and saved invoice) |
| `inventory.spec.ts` | Category → Type filters, Stone Type swap for a stone, footer totals (Products and Stock) |
| `artisan.spec.ts` | Open Jobs → Receive Items; Receive Material's net weight calculation |
| `dashboard.spec.ts` | Best Sellers card: every period and tab renders, ranked list shows |
| `thermal-print.spec.ts` | Thermal receipt: QR on the left, invoice + IRN/Ack details on the right; A4 prints carry no QR |
| `stock-qr-print.spec.ts` | Stock QR tags: QR left / details right; print is one 80×30mm thermal label per page, at the paper edge |
| `product-images.spec.ts` | Product Images: add / make cover / remove / save order; square tiles for any photo shape; non-Blob URLs rejected |
| `reports.spec.ts` | Every report tab renders; Stock report's Available / Out of Stock split; CSV export |

**When you build a feature, add a test for it here** — that's what keeps
the next change from quietly breaking it.

## Running locally

Never against the `.env` database. Use a local Postgres:

```bash
createdb rl_e2e   # or: psql -c "create database rl_e2e"
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/rl_e2e
export NEXTAUTH_SECRET=local-e2e NEXTAUTH_URL=http://localhost:3100 SMTP_HOST=
npx prisma migrate deploy && pnpm seed && pnpm db:seed:full-demo && pnpm db:backfill:fine-weights
pnpm build
npx playwright install chromium   # first time only
pnpm test:e2e
```

Sign-in: the tests don't go through Google/OTP. `global-setup.ts` signs a
NextAuth session token with the run's own `NEXTAUTH_SECRET`, exactly as
the app's login would — there's no test-only login route in the app.
