# Swarna Suite — Store Owner's Guide

A plain-language guide to running your business on Swarna Suite. Written for the
**Store Owner (Admin)** — the person who sets the store up and manages the team.

_Last updated: 5 October 2026._

---

## 1. What this system does

Swarna Suite keeps one connected record of your trade: who you buy from, what you
hold in stock, what you sell, what your artisans (goldsmiths) are holding, and who
owes you money — in money, in fine gold and silver, and in carats.

Everything is **scoped to your store**. Your parties, stock, invoices and reports
are yours alone — other stores on the platform cannot see them, and you cannot see theirs.
Even the platform's Super Admin can only open your store with a code you give them
(see **Collaboration** below).

The system is **not gold-specific**. Gold, silver, platinum, diamond, coloured stones
or anything else — you decide the materials you deal in, in Settings.

---

## 2. Getting started and signing in

### Registering a new store

Anyone can open a store from the home page (**Register your store**). Registration
creates the store, makes you its Owner, and starts you on the free trial plan.
Your plan and its expiry date are shown under **My Plan** in the account menu, and
you get a reminder before it runs out.

> **When a plan expires the store becomes view-only** for everyone in it — you can
> still see and export your records, but nothing new can be saved until it is renewed.

### Signing in

- **Google account** — click Sign in with Google.
- **Mobile number + OTP** — enter your registered number and the one-time code.

OTP rules:

- A code is valid for **1 minute**. Use **Resend** if it expires.
- **5 wrong codes lock the account for 24 hours**, and the account holder gets an email.
- Only numbers already added to a store can sign in with OTP — there is no sign-up by OTP.

You are signed out automatically after 24 hours. If someone tries to sign in to an
account you have disabled, they are refused and get an email telling them who to contact.

---

## 3. First-time setup

A new store already comes **pre-filled** with what you need to start entering stock:

| Already set up for you | Where to change it |
|---|---|
| Metals: **Gold** (24K, 22K, 20K, 18K, 14K), **Silver** (999, 925), **Platinum** (950, 900), Other | Settings → Metals & Categories |
| Stones: **Diamond** (Natural, Lab-Grown), **Ruby**, **Emerald**, **Sapphire** — weighed in carats | Settings → Metals & Categories → Stones |
| Categories: Ornament (Ring, Chain, Necklace…), Coin, Bar, Loose Stone, Diamond | Settings → Metals & Categories |
| Styles (Ladies, Gents, Kids, Unisex) and Stone Clarities (EF/VVS … IJ/SI) | Settings → Metals & Categories |
| GST rates: **3%** (gold, silver, platinum, jewellery — the default), **0.25%** (rough/loose diamonds and stones), **5%** (artisan job work), **0%** | Settings → GST Rates |
| A **Main Counter** location (stores registered from the website) | Settings → Locations |

> **Check the GST rates with your CA.** They are starting values, not tax advice.
> The rate for cut & polished diamonds in particular is quoted differently by
> different sources.

Then do these once, in this order, before your team starts entering real data.

### Step 1 — Business Settings

Settings → **Business Settings** has these tabs:

- **Business Details** — Business Name, Legal Name, logo.
- **Tax & Compliance** — GSTIN, PAN, CIN, GST State Code and your **GST scheme**:
  - *Retailer (B2C)* or *Wholesaler & Manufacturer (B2B)* — GST charged on every invoice.
  - *Small Local Jeweler (Composition)* — GST is never charged; documents print as a Bill of Supply.
- **Address** and **Bank Details** — the bank block prints as "Pay To" on invoices.
- **Business Model** — which units you settle balances in: Money, plus any metal or stone.
  The metal-wise Ledger only shows the units ticked here.
- **Feature Toggles** — turn on or off: Supplier module, E-way Bill, E-Invoice (IRN),
  Send to Artisan, Due Date, Style field.
- **Return Policy** — whether returns are allowed and the return window (default 30 days).
- **Invoice Preferences** — prefix, starting number, terms, notes, print layout
  (A4 template or Thermal 80 mm), Hallmark charge per piece.

> **Do this first.** Your business name, logo and invoice numbering are printed on every
> document. The Hallmark charge (default ₹45) is a placeholder — set it to what your
> hallmarking centre actually charges.

### Step 2 — Metals, stones and categories (Settings → Metals & Categories)

- **Metals** — each has a **Has Purity** switch (on for gold/silver/platinum), a primary
  unit (grams), its **Purities** (label, fineness %, SKU code, hallmarkable) and an
  optional default selling price.
- **Stones** — Diamond, Ruby, … each with **Stone Types** (e.g. Natural, Lab-Grown),
  weighed in **carats**. A row added as a metal by mistake can be **moved to Stones**.
- **Categories** and **Types** — Ornament → Ring, Chain…; a category can be limited to
  certain metals.
- **Styles** and **Stone Clarity** lists.
- **SKU format** — how product codes are generated (see Inventory).
- **Import from Excel** — bring in a long list at once.

### Step 3 — Purity & Carat (Settings → Purity & Carat)

Fineness for each purity (24K = 100%, 22K = 91.6%, 925 = 92.5% …), carat conversion
rules, and **Metal Selling Rates per purity** — the rate that pre-fills on a sale.
Fineness drives every fine-weight figure in artisan jobs, Customer Exchange and
reports, so get it right early.

> **Changing rates every day?** You don't need Settings for that. Click the
> **rates chip** in the top bar (e.g. "Gold 22K ₹6,000 · Silver ₹98"), type the new
> rates and press **Save**. It changes the same rates as Settings, and the next invoice,
> estimate or quotation uses them. Only the Store Owner can edit them; Staff see them
> read-only. Every change is listed under **Metal Rates → Your Selling Rates** (when,
> which rate, who). The **Market Rates** table below it is the daily market price, for
> reference only — it never changes your selling rates.

### Step 4 — Locations (Settings → Locations)

- **Store Locations** — your counters or branches. One is the **Default Location** and
  pre-fills everywhere.
- **Delivery Locations** — the states you deliver to. An invoice's Delivery Location
  decides CGST + SGST (same state) or IGST (other state). Leave it empty if you only
  sell within your state.

### Step 5 — Your team (Account menu → Users)

| Field | Notes |
|---|---|
| **Name, Email, Phone** | Email enables Google sign-in and emails; phone enables OTP |
| **Role** | Admin or Staff — see below. Artisan logins are created from the Artisan page |
| **Module Access** | Which sections a Staff member can open |
| **Location Access** | Which locations a Staff member can see |
| **PAN, Aadhaar, photo** | Optional |
| **Status** | Active / Invited / Disabled — disable to block sign-in without deleting |

New users get a welcome email with sign-in instructions. One person can belong to
several stores and switch between them from the store switcher in the top bar.

---

## 4. Roles and permissions

| Role | What they can do |
|---|---|
| **Store Owner (Admin)** | Everything in your store — settings, users, all data. |
| **Staff** | Day-to-day work. You choose which sections and which locations they can open. |
| **Artisan** | Signs in and sees only **My Jobs** — their own jobs and their own ledger. Nothing else. |

### Restricting a Staff member

Open the user and set **Module Access**. The sections you can grant or withhold:

Dashboard · Parties · Suppliers · Inventory · Billing · Quotations · Purchases ·
Artisan Management · Reports · Ledger

A Staff member without a section does not see it in the sidebar, cannot reach it by
typing the address, and does not see its shortcuts — for example, without **Billing**
the **Sale** button in the header disappears. Settings and Users stay owner-only.

**Location Access** works the same way: a Staff member with locations ticked only sees
invoices, purchases and stock tagged to those locations.

> **A new Staff member starts with full access.** Restrictions only apply once you tick
> specific modules or locations. Leaving them untouched means "everything".

> **Changes take effect at next sign-in.** If you change someone's role or access while
> they are logged in, they must sign out and back in before it applies.

---

## 5. Day-to-day work

### Parties (customers and suppliers)

One **Parties** list holds everyone you trade with. A party you buy from is marked as a
supplier automatically the first time you record a purchase from them (or tick
**Also Supplier**). A party's page shows its **customer balance** and **supplier
balance** separately, with buttons for **Sale, Payment In, New Purchase and Payment Out**,
and a statement you can email.

Mark a party **GST registered (B2B)** and add their GSTIN to print it on invoices.
Phone is optional. Parties can be imported from Excel and archived.

Turn on **Settings → Feature Toggles → Supplier module** for a separate **Suppliers** menu.

### Inventory — Products and Stock

- **Product** — the design: what an item *is*.
- **Stock** — the actual pieces you hold, each with its own stock code, weight, quantity
  and a printable tag.

Adding a product:

1. Choose **Metal** or **Stone**.
2. Add one or more **metal rows** (metal, purity, gross/net weight, GST rate) and, if the
   piece has stones, **stone rows** (stone, type, clarity, pcs, carats, weight, rate,
   GST rate, IGI certificate no.). One piece can mix metals and stones — e.g. 22K gold
   with diamonds.
3. Net weight and an **Estimated Value** (with GST per rate) are calculated for you.
4. The **product code (SKU)** is generated automatically from metal + purity + style +
   category + a running number (layout chosen in Settings).

Stock shows **Qty in stock** with an *In Stock / Out of Stock* filter. Tags print as
**80 × 30 mm thermal QR labels**; scan one with a phone camera to open or sell that piece.
Products can have several images, can be archived, and can be imported from Excel
(optionally with opening stock).

### Purchases

**Purchases → Purchase Bills** — record what you buy from any party. Pick a product or
choose **Enter Manually**. A purchase **creates stock automatically**, one entry per line.
GST and HSN are per line; diamonds are entered in carats. An unpaid balance goes to the
party's supplier balance. Drafts and partial purchases can be edited line by line.

**Purchases → From Customers** lists **Customer Exchanges** (see Billing).

### Quotations

A quotation is only a proposal — it does **not** touch stock or the ledger. Nothing moves
until you **convert it to an invoice**. Date, valid-until and notes can be edited.

### Billing

Under **Billing**:

- **Tax Invoices** — the formal GST invoice.
- **Estimates** — a provisional bill (formerly *Kacha slip*). It can be converted to a
  Tax Invoice later; the two stay linked.
- **Credit Notes** — returns and exchanges.
- **Offers & Vouchers** — discounts and gift vouchers.

The **Sale** button in the header (or the "+" next to Tax Invoices) asks which document
to create.

Rules to know on every sale:

> **Every line is sold from real stock.** Pick a stock piece — its metal, purity, weight,
> stones and GST rate fill in and lock — or type a new line, and the system creates the
> product and stock behind it automatically. Only in-stock pieces can be sold, and selling
> reduces the stock quantity.

> **A hand-typed line must say "Purchased From"** — the party the piece came from.

- **GST is per line.** CGST + SGST or IGST follows the invoice's **Delivery Location**.
  A Composition-scheme store never charges GST.
- **Hallmark charge** fills in automatically for hallmarkable purities.
- **Discount** (% or ₹), editable **Round Off**, and a **payment method** for money taken now.
- **Store credit** a party holds can be applied on the invoice or when recording a payment.
- **Vouchers** — enter a voucher code; the discount comes off before GST.
- Invoices can be **edited**, or **cancelled and replaced**. Each invoice shows who
  raised it and its payment history.
- Optional **Due Date**, **E-way Bill** and **E-Invoice (IRN)** details (Settings toggles).
- Print on an **A4 template** or **Thermal 80 mm**, email it, or **share as a PDF on WhatsApp**.
- Invoice numbers carry the date but keep running — they do not restart each day.

#### Customer Exchange (old gold)

On New Invoice, start a **Customer Exchange** when a customer hands in old gold, silver,
platinum or stones. Enter gross/net weight and purity; the value is
**pure (24K / 999) weight × pure rate, less your deduction %**. It is recorded as a
purchase from that customer (Purchases → From Customers), taken off the bill, and printed
on the invoice. Any excess is kept as store credit or paid out.

#### Returns — Credit Notes

Within the return window, a sold item can be returned on a **Credit Note**: the stock
comes back and the party is credited (usable as store credit).

#### Offers & Vouchers

Create **% off**, **flat ₹ off** or **Buy X Get Y** offers, then issue single-use codes
to customers. A code is redeemed on New Invoice.

### Draft Orders (custom / phone orders)

1. **Draft Orders → New** — the customer's order, with an optional advance payment.
2. **Send to Artisan** — creates the artisan job.
3. **Receive Items** — pre-filled from the order; the finished pieces become product and stock.
4. Sell them on an invoice as usual.

All items on one order share one metal and purity. Orders can be edited or cancelled.

### Artisan (goldsmith) management

1. **Issue material** to an artisan against a job.
2. The artisan sees that job — and only their own jobs — when they sign in.
3. **Receive items** back when the work is done (partial receipts are fine), or use
   **Receive Material** for metal returned without an open job.

For purity metals, weights are converted to fine weight so issued and received
quantities compare directly. **Wastage %** is added to what is credited back, and a
**making / labour charge** is recorded as money owed to the artisan. Each artisan has a
**Financial Ledger** (money) and a **Material Ledger** (per metal), and every entry shows
who recorded it.

### Payments

**Payments → Payment In / Payment Out** — record money received from or paid to any party
or artisan, even when it isn't tied to one invoice or purchase.

### Ledger

- **Ledger Entries** — every transaction across parties and artisans, with filters.
- **Metal-wise** — a day-by-day purchased / sold breakdown per metal (diamonds in carats)
  with a running closing balance. Only shows the units ticked in
  **Settings → Business Settings → Business Model**.

### Reports

Revenue, outstanding balances, stock value, a **Stock report** (available / out of stock),
open jobs, parties with dues, and the fine-metal flow — purchased, issued, received,
wastage, sold, remaining. Filter by financial year or dates. Reports and Ledger export to
**CSV, Excel or PDF**, matching what is on screen. Large reports can be emailed, and
**Settings → Reports & Notifications** schedules them daily, monthly, quarterly or yearly.

### Dashboard

Sales trend by metal, best sellers, metal stock and money KPIs, with Daily/Monthly
toggles. Cards can be dragged and resized; your layout is remembered.

### Importing and exporting with Excel

Parties, Products, Stock, Artisans, Estimates and Settings → Metals & Categories can all
be exported to Excel and imported back. Start from **Download template** — it has an
**Instructions** sheet and drop-down lists of your own metals, purities, parties and
locations. An **exported file has exactly the template's columns**, so you can export,
edit in Excel and import the same file back.

- The header row stays frozen and yellow while you scroll.
- Columns are sized to fit what's in them.
- **Your sheets match your settings.** If you switch off Style, E-way Bill, E-Invoice or
  Send to Artisan, or haven't set up Locations or GST Rates, those columns don't appear in
  your templates and exports. An older file that still has them imports normally — the
  column is simply ignored.
- An import is **all or nothing**: if any row has a problem, nothing is saved and every
  problem is listed — often with a suggestion such as *"Did you mean Gold 22K?"* or
  *"Already saved as …"*.
- Estimates imported from Excel post to the party's ledger, just like ones typed in.
- Ledger export includes every entry matching the filters on screen, not just the
  latest 500.

### Printed tags (Settings → QR & Barcode Tags)

Choose which details print on QR and barcode tags. **Drag** a field to change its order,
drag a field from *Add a field* into the list, or drag one back out to remove it. The
arrow buttons do the same on a phone.

---

## 6. Search, notifications and help

- **Search (Ctrl + K)** — jump to any party, invoice, product or stock piece from anywhere.
- **Bell icon** — alerts such as unpaid invoices, overdue artisan jobs and out-of-stock
  products, limited to what your role and locations cover.
- **Account menu** — Users, Branding, Calendar (your reminders and Indian holidays),
  Support Tickets, Contact & FAQ, My Plan.

### Collaboration (Settings → Collaboration)

The platform Super Admin cannot open your store on their own. To get help inside your
data, share your **Collaboration Code** with them; you are notified when they ask for access.

---

## 7. Emails the system sends

| Trigger | Goes to |
|---|---|
| You create a user | The new user — welcome and sign-in instructions |
| An artisan is given login access | The artisan |
| A disabled account attempts sign-in | The account holder |
| 5 wrong OTPs lock an account | The account holder |
| Super Admin requests access to your store | The store owner |
| You click Email on an invoice, estimate or quotation | The party |
| You click Email Statement on a party | The party |
| A scheduled or large report is ready | The address set in Settings |
| Your plan is about to expire | The store owner |

All of these are sent under your business name. Sending is best-effort — if email is
misconfigured you are told, but the record you just saved is never lost.

---

## 8. Good habits

- **Complete Settings before your team starts.** Business name, numbering and GST rates
  are printed on every document.
- **Check the pre-filled GST rates and Hallmark charge** with your CA and hallmarking centre.
- **Disable, don't delete.** Turning a user off blocks sign-in while keeping their history.
- **Give Staff only the sections and locations they need.**
- **Convert, don't retype.** Estimate → Tax Invoice, Quotation → Invoice and Draft Order →
  Artisan → Stock carry the details across and keep the trail linked.
- **Tag stock as it arrives** so it can be scanned and sold at the counter.
- **Reconcile artisan jobs on return,** while the wastage figure is still fresh.
