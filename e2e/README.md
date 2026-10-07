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
| `offers.spec.ts` | Billing → Offers & Vouchers: create a % offer with a public code (normalised to upper case), bulk-generate 2 single-use voucher codes, revoke an unused one |
| `delivery-location.spec.ts` | New Invoice hides Delivery Location when Settings has none picked; shows it once one is |
| `multi-part.spec.ts` | One piece of gold + silver + diamond on a sale line (per-row value & GST, gold-only pure weight on the line, stock + product breakdown, printed 1.5% GST group, per-row quick edit), a Customer Exchange item, a purchase line, and Kacha / Quotation lines that keep their rows when converted to an invoice |
| `purity-check.spec.ts` | A 22K purity saved at 100% is flagged in Settings and fixed to 91.6% in one click |
| `conversion-gst.spec.ts` | Converting a 2-piece Estimate / Quotation line taxes both pieces (preview and saved invoice) |
| `promotions-redeem.spec.ts` | Offers at billing: 10% off before GST, a single-use voucher refused twice and freed by cancelling, buy 1 get 1 free |
| `inventory.spec.ts` | Category → Type filters, Stone Type swap for a stone, footer totals (Products and Stock) |
| `artisan.spec.ts` | Open Jobs → Receive Items; Receive Material's net weight calculation |
| `dashboard.spec.ts` | Best Sellers card: every period and tab renders, ranked list shows |
| `thermal-print.spec.ts` | Thermal receipt: QR on the left, invoice + IRN/Ack details on the right; A4 prints carry no QR |
| `stock-qr-print.spec.ts` | Stock QR tags: QR left / details right; print is one 80×30mm thermal label per page, at the paper edge |
| `stock-autofill.spec.ts` | Picking an 18K + diamond piece with no selling price fills Purity, the stone and Rate / g (today's 24K × fineness); QR/Barcode tags print every metal and stone and follow Settings → QR & Barcode Tags; Stock list shows Product Code over `STOCK-CODE (qty)` and Fine Weight |
| `product-images.spec.ts` | Product Images: add / make cover / remove / save order; square tiles for any photo shape; non-Blob URLs rejected |
| `header-rates.spec.ts` | Top bar "Today's Rates": the Store Owner changes Gold 22K's selling rate and it lands on the purity's own selling price and in Metal Rates → Your Selling Rates |
| `party-sheet.spec.ts` | Parties template = export columns, bad rows reject the whole file, an exported party re-imports equal, Suppliers export is suppliers only |
| `karigar-sheet.spec.ts` | Artisan export → import round trip (opening cash, inactive, GST, metals, location), duplicate mobiles refused, ledger export columns |
| `kacha-sheet.spec.ts` | Estimate import posts the party ledger, export → re-import is equal, backup → restore keeps slip number and DMO weight |
| `taxonomy-io.spec.ts` | Metals/Purities and Stones/Stone Types export → import round trip, metal/stone name clash rejects the file, price changes logged |
| `export-columns.spec.ts` | Ledger export past 500 rows with the page's filters; invoice export GST split and status labels |
| `store-admin-scope.spec.ts` | Store data export has every table, Force Delete Store removes a seeded store, Users export CSV of selected rows, location-restricted staff can't see other locations' credit notes / draft orders |
| `tag-fields-dnd.spec.ts` | QR tag fields reordered, added and removed by drag and drop |
| `stock-sheet.spec.ts` / `product-sheet-multi.spec.ts` / `finish-io.spec.ts` | Stock and Product import/export: every field, multi-metal pieces, Finish |
| `sheet-features.spec.ts` | Style off → no Style column in product/stock templates and exports, old files still import; E-way Bill / E-Invoice off → no such invoice export columns |
| `stock-pick-multi-part.spec.ts` | Picking a gold + silver + diamond (12 pcs) + ruby piece on Invoice / Estimate / Quotation opens every metal and stone with rates and pcs, and the invoice saves all four rows |
| `stone-piece-details.spec.ts` | Hand-typed stone pcs / clarity / certificate saved on an Estimate, kept on conversion to Invoice and printed; Add Stock of a multi-part Product writes its rows |
| `stone-details-edits.spec.ts` | Invoice quick edit of stone pcs / clarity / certificate (single and multi-part) without re-pricing; Purchase / Exchange clarity suggestions; editing an Add Stock piece re-splits its rows |
| `weight-settings.spec.ts` | Settings › Weights: each option's effect on Add Stock and invoice lines, wastage default copied and editable, rounding, confirmation counts, recalculation changes fine but not issued invoices' net/amount, and another store stays untouched |
| `icon-tooltips.spec.ts` | Hovering row / settings / sidebar / dialog icons shows their tooltip; a crawl of 8 main pages fails on any unlabelled icon-only control |
| `search-focus.spec.ts` | Header search, stock picker and the list search on Products / Stock / Parties / Artisans / Invoices keep the cursor while typing and through the reload |
| `igi-search.spec.ts` | Products and Stock are found by a partial IGI / certificate number |
| `weight-decimals.spec.ts` | With 2 gram decimals: product detail, invoice line, Stock report (+ CSV) and ledger show 2-decimal grams |
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
