# Swarna Suite — Store Owner's Guide

A plain-language guide to running your business on Swarna Suite. Written for the
**Store Owner (Admin)** — the person who sets the store up and manages the team.

---

## 1. What this system does

Swarna Suite keeps one connected record of your trade: who you buy from, what you
hold in stock, what you sell, what your goldsmiths are holding, and who owes you money.

Everything is **scoped to your store**. Your customers, stock, invoices and reports
are yours alone — other stores on the platform cannot see them, and you cannot see theirs.

The system is **not gold-specific**. You define the materials you actually deal in —
gold, silver, diamond, platinum, or anything else — in Settings.

---

## 2. Signing in

Two ways to sign in:

- **Google account** — click Sign in with Google.
- **Mobile number + OTP** — enter your registered number and the one-time code.

**There is no public sign-up.** An account must be created for you first. You create
your team's accounts from the Users page; your own account is created by the platform
Super Admin when your store is opened.

If someone tries to sign in to an account you have disabled, they get an email telling
them the account is blocked and who to contact. Their sign-in is refused.

---

## 3. First-time setup

Do these once, in this order, before your team starts entering real data.

### Step 1 — Business profile (Settings)

Fill in the details that appear on your invoices and emails:

- Business Name, Legal / Registered Name, Logo
- GSTIN, PAN, GST State Code, Default GST Rate
- Address, City, State, Pincode, Phone, Email, Website
- **Invoice Prefix** and **Next Invoice No.** — controls how invoices are numbered
- Invoice Terms & Conditions, Default Invoice Notes

> **Do this first.** Until you save your Business Name here, invoices and outgoing
> emails fall back to your store's registered name rather than your trading name.

### Step 2 — Materials and categories (Settings → Taxonomy)

Define the vocabulary your business actually uses:

- **Metals** — the materials you deal in. Each one has a **Has Purity** switch.
  Turn it **on** for metals sold by fineness (gold, silver); leave it **off** for
  materials priced another way (diamond, stones).
- **Categories** — the kinds of goods you deal in: Ornament, Coin, Bar, Loose Stone.
- **Types** — the specific items under each category: Ring, Chain, Bangle, and so on.

Your store starts with sensible defaults. Rename, remove or add to them freely.

### Step 3 — Purity and fineness (Settings → Purity)

The conversion table for metals with **Has Purity** switched on — 24K = 100%,
22K = 91.6%, and so on. Standard values are filled in for you. Change them only if
your house standard differs.

This table drives all fine-weight maths in karigar jobs and reports, so get it right early.

### Step 4 — Your team (Users)

For each person, set:

| Field | Notes |
|---|---|
| **Name** | |
| **Email** | Enables Google sign-in and lets them receive email |
| **Phone** | Enables OTP sign-in |
| **Role** | See the roles table below |
| **Module Access** | Which sections a Staff member can open |
| **Linked Karigar** | For Karigar accounts, ties the login to a goldsmith record |
| **Active** | Turn off to block sign-in without deleting the person |

New users get a welcome email with sign-in instructions.

---

## 4. Roles and permissions

| Role | What they can do |
|---|---|
| **Store Owner (Admin)** | Everything in your store — settings, users, all data. |
| **Staff** | Day-to-day work. You choose exactly which sections they can open. |
| **Karigar** | Signs in and sees only their own assigned jobs. Nothing else. |

### Restricting a Staff member

Open the user and set **Module Access**. The sections you can grant or withhold:

Customers · Vendors · Inventory · Billing · Quotations · Purchases ·
Karigar Management · Reports · Ledger

A Staff member without a section does not see it in the sidebar, cannot reach it by
typing the address, and does not see its shortcuts in the top bar. For example, a Staff
member without **Billing** loses the **New Invoice** button in the header.

The Dashboard is always visible. Settings, Users and Stores stay owner-only.

> **A new Staff member starts with full Staff access.** Restrictions only apply once
> you tick specific modules. Leaving Module Access untouched means "everything".

> **Changes take effect at next sign-in.** If you change someone's role or access
> while they are logged in, they must sign out and back in before it applies.

---

## 5. Day-to-day work

### Customers and Vendors

Separate lists, each with its own ledger. Every customer has a running balance and a
statement you can email them directly from their page.

### Inventory

- **Products** — your catalogue: what an item *is*.
- **Stock** — the individual pieces you actually hold, each with its own stock code.
- **Print QR** — generate QR labels for stock pieces.

### Purchases

Record what you buy from a vendor. A purchase **creates new stock automatically** —
one stock entry per line item, numbered for you. If you have not paid in full, the
balance is posted to that vendor's ledger as money you owe.

### Quotations

A quotation is only a proposal. It does **not** touch your stock or ledger. Nothing
moves until you **convert it to an invoice** — that is the step that marks stock sold
and posts to the ledger.

> If a quotation seems not to have updated your stock, check whether it was ever converted.

### Billing

Two documents:

- **Kacha Slip** — a provisional / estimate slip.
- **Pakka Invoice** — the formal tax invoice.

A Kacha slip can be **converted into a Pakka invoice** later. Both documents show the
link, so you can always trace one to the other.

Selling marks the stock piece **Sold** and posts any unpaid balance to the customer's
ledger. A fully paid invoice creates no ledger entry — there is nothing outstanding to track.

Both documents can be **emailed to the customer** from the document page.

### Karigar (goldsmith) management

1. **Issue material** to a karigar against a job.
2. The karigar sees that job — and only their own jobs — when they sign in.
3. **Receive items** back when the work is done.

For metals with **Has Purity** switched on, weights are converted to a common
fine-weight basis so issued and received quantities are comparable. **Wastage** is
folded into what is credited back, so a job's closing balance reconciles instead of
reading as missing metal.

The **Karigar Ledger** shows a running fine-metal and cash balance per goldsmith.

### Ledger

- **Ledger Entries** — every transaction across customers, vendors and karigars, with filters.
- **Metal-wise** — a day-by-day purchased / sold breakdown per metal with a running
  closing balance.

> The Metal-wise view only shows metals you have configured under
> **Settings → Business Units**. A metal missing from that list is left out of this
> view even if you have stock and transactions for it.

### Reports

Revenue, outstanding balances, stock value and counts, open jobs, customers with dues,
and a fine-metal flow summary — purchased, issued to karigar, received back, wastage,
sold, remaining in stock, and still with the karigar.

Reports and Ledger both **export to CSV or Excel**, matching exactly what is on screen.

### Metal rates

Daily gold and silver rates, updated automatically, with your own manual entries where needed.

---

## 6. Notifications and search

- **Bell icon** — live alerts: invoices with an outstanding balance, overdue karigar
  jobs, and out-of-stock products. "Clear all" hides them until the underlying record changes.
- **Search box** — jump to any customer, invoice, product or vendor from anywhere.

---

## 7. Emails the system sends

| Trigger | Goes to |
|---|---|
| You create a user | The new user — welcome and sign-in instructions |
| A karigar is given login access | The karigar |
| A disabled account attempts sign-in | The account holder |
| You click Email Invoice / Email Slip | The customer |
| You click Email Statement on a customer | The customer |

All of these are sent under your business name. Sending is best-effort — if email is
misconfigured you are told, but the invoice or user you just saved is never lost.

---

## 8. Good habits

- **Complete Settings before your team starts.** Invoice numbering and your business
  name are baked into every document you issue.
- **Deactivate, don't delete.** Turning a user off blocks sign-in while keeping their
  history intact.
- **Give Staff only the sections they need.** It reduces mistakes as much as it protects data.
- **Convert, don't retype.** Kacha → Pakka and Quotation → Invoice carry the details
  across and keep the paper trail linked.
- **Reconcile karigar jobs on return,** while the wastage figure is still fresh.
