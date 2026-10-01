# Migrating customers from Acme Infinity → RatnaLekha

Status: research complete, build not started (2026-10-01).

Sources: the vendor's own videos on acmeinfinity.com:
- the retailer feature demo, 22 videos, Hindi + English
  (`youtube.com/playlist?list=PLfyENIp5cbzTwvPiqS2QUeLf2OnzagxvG`);
- the "Yashogatha" story series, 14 episodes;
- the wholesaler and manufacturer demos (2019);
- the acmeinfinity.com site itself (FAQ, download page, module pages).

We had no database, no export and no manual. Everything below was
reconstructed from ~860 extracted screen frames plus the site text. Items marked **(inferred)** are deductions, not
something shown on screen. Confirm them with the first real customer.

> Note: `acmesoftware.com` is an unrelated US custom-dev agency. The product
> here is **Acme Infinity – ERP For Jewellery Business**. The status bar on
> the screens credits *Acme Computer Consultants, Satara* ((02162) 233549).
> The web demo logs in as `acmeinfovision`.

## Summary

**What it is.** Acme Infinity is a mature Indian jewellery ERP: about 300
jewellers, a Windows desktop app written in Clarion/C/C++ on **MySQL**, with
a newer cloud edition. Every jeweller using it has:
- **label-wise stock**: each piece has a tag number, gross/net/stone weight,
  purity, making, stones and photos;
- **metal (weight) accounts** with karigars, melters and refiners;
- open customer orders with **metal and cash advances**;
- savings schemes (Bhishi), gift vouchers;
- bill-wise customer dues and a Tally-style ledger;
- for wholesalers: fine-metal and amount balances with every party, plus
  rate-cut (unfixed-rate) trading;
- for manufacturers: department-wise WIP, job cards and a design master.

**How we get the data out.**
- **On-premise customers:** take a MySQL dump of the customer's own
  database, with their consent. This gives everything.
- **Cloud customers, or as a fallback:** the customer exports the 24 reports
  listed in §3 to Excel. Our importer must understand Infinity's report
  layout.

**What we bring across.** Opening position only, as on a cutover date:
- masters: locations, metals, items, stones, customers, suppliers, karigars;
- every label in stock;
- party dues bill-wise;
- karigar metal balances;
- open orders;
- scheme and gift-voucher liabilities.

Old bills are optional history. Even Acme only converts stock, vendor and
customer data when it takes customers from other software.

**What RatnaLekha must add first** (§4–5):
- import batches with legacy IDs, so imports can be re-run and rolled back;
- per-label stones and photos;
- multi-metal karigar openings;
- an order metal-deposit balance;
- savings schemes and gift vouchers;
- salesman on the bill;
- a migration screen with preview and a reconciliation check against the
  legacy totals.

---

## 1. What the legacy product is

| Aspect | Finding |
|---|---|
| Versions seen | In the videos: "Infinity – Jewellary Version" 3.000 → 4.600 (2007–08) and "Acme Infinity – ERP For Jewellery Business" 5.003 / 5.118 (2009–10). **The current download is Infinity Upgrade 11.220** (acmeinfinity.com/download), so today's customers are far newer than the demo screens. |
| Vendor | Acme Infovision System Pvt. Ltd., Satara (support (02162) 661503). Per their FAQ, "close to 300 jewellers" use Infinity, across retail, wholesale, manufacturing, multi-branch and export. Sister product: Acme Insight (general retail). Cloud platform: "Acme PADM". |
| Editions | **On Premise** (Windows, LAN, branch auto-sync) and **On Cloud** (desktop/mobile/tab). Each comes in tiers: Jewel Shop (single shop), Jewel Biz (multi-branch), Jewel Corp (enterprise). |
| Platform | Windows desktop; install folder `D:\Acmewin`, main program `Acmepro.exe`. At startup the user picks the **year** in a "Select Program" window. The 2007-era demo had a small web storefront on `localhost:8080`. |
| Built with | **Clarion, C & C++**, confirmed by the vendor FAQ. This matches the Clarion template strings on screen ("Browsing the DocumentTypeMaster file", "Record Will Be Added", `@s25` pictures). |
| Data store | **MySQL**, confirmed by the vendor FAQ ("The Database is MySQL"). There is one database per company/FY ("Database Name 2008_09" is created at year-end), and "Re-updates balances from previous year" carries them forward. Very old installs may still be on Clarion TopSpeed `.TPS` files (inferred). |
| Backups | A built-in Backup / Restore DB with scheduler and "auto backup on exit". It writes to a chosen folder in **weekday sub-folders** (e.g. `D:\nilesh\Saturday`). |
| Tax era | The demos are VAT-era (1% on gold), with TDS 194C/193 and e-TDS. **Current builds have GST:** HSN-wise GST, GST returns, and ITC-04 job-work reports. They also have RFID, a mobile app, SMS/e-mail alerts, customer PAN, amount-based saving schemes and a Money Lending (gold loan) module. |
| Multi-branch | One local DB per branch, synced to a central DB. Every document and ledger carries a Location. |

### Data-out channels (best first)

1. **MySQL dump** (on-premise customers). The database runs on the jeweller's
   own server PC, so with the customer's written consent a `mysqldump` of the
   current-year database (plus the previous year if history is wanted) gives
   us **every table with full history**. Their own "Auto data backup" files
   are very likely MySQL dumps too (inferred).
   - Risks:
     - the MySQL password may be held by Acme;
     - "Data backup protection with security code" may encrypt the backups;
     - table and column names are unknown until we see one real dump.
   - **Get one dump from a friendly first customer and map it once.** After
     that every on-premise migration becomes repeatable.
   - Very old installs on TopSpeed `.TPS` files can be read with open-source
     tools (`tps-parse`, `pytopspeed`).
2. **Cloud-edition customers** cannot dump the database. For them, use
   channel 4.
3. **`Export-Import` top menu** (v4.5+). It is visible on screen but was never
   opened in the videos, so its contents are unknown. Ask the customer to
   screenshot it.
4. **Report → Excel / PDF.** The vendor FAQ says "All reports in Excel and
   pdf format"; in the old builds this is "Save To Excel" on every Report
   Preview. Export is a **per-user right** ("Selective rights for data export
   to Excel"), so the customer's admin may have to grant it. It writes a formatted
   workbook through Excel automation. The customer can do this themselves
   today. **This is our baseline channel and the importer must handle it.**
5. Grid windows with **ToText** or **Print** (Accounts Under Selected Group, etc.).
6. The **Infinity → Tally** export. It is confirmed by the FAQ, covering
   accounting data plus job-worker and inventory data. It is useful only for
   accounting ledgers.
7. Item photos sit on disk as `Images\IMG<prefix><zero-padded label>.Jpg`
   (e.g. `IMG1000040031510.Jpg` ↔ label 31510). We can bulk-attach them
   by label number.

---

## 2. Reconstructed legacy data model

### Masters
- **Company / FY.** The FY is chosen at login and shown in the header. The FY
  span is configurable, including multi-year spans.
- **Branch → Location tree.** Example: Primary ▸ Laxmi Road ▸ (Back Office ▸
  Accounts, Safe; Counter ▸ Delivery/Order/Sales Counters), plus Camp,
  Chinchwad, Paud, Head Office and Exhibition.
  - Virtual locations also exist: `0. APPROVAL`, `ORDER BOX`, `OLD GOLD`,
    `LABELING`, `PRODUCTION GOLD`, `RNG COUNTER`, `Sales Return`,
    `CUSTOMER RECEIPT DEPT`, and process stages (Casting, Filing, Pre‑Polish).
- **Product Group tree.** Primary ▸ Gold (Gold 18K, Gold 22K, Diamond
  Jewellery, Gold Jewellery ▸ New Ornaments, Old Ornaments, Precious Stone
  Jewellery, Standard Bar) / Silver / Stone (Diamond, Precious, Non-precious)
  / General Items.
  - The dashboard groups by GOLD, SILVER, STONE, Forming Jewellery,
    Diamond and Colour Stone.
- **Item (Particulars).** A free-text name, sometimes with a numeric prefix
  ("08MOHANMALA", "1.VEDHANI.") or a purity suffix ("CHAIN 22K",
  "BRACELET D18K"). Each item has a short code (DBN, DLK, DNK…).
  - Stock unit is PCS or WT.
  - **Stones are items in the same master.**
- **Category.** It mixes two meanings:
  - the making-charge basis ("Making On GrWt", "Making On NtWt",
    "Making On Pc", "per gram", "Not Applicable");
  - the design family ("CASTING ANGATHI.", "18K DIA BANGLE_2.4").
- **Item attributes.** User-defined per product group, e.g. SIZE, Metal
  Type, Style, Design No. Stones carry Colour / Clarity / Cut / Carat.
- **Stone codes.** DCh‑SD, DCh‑VS, DCh‑VV, DRd‑SD, DMq‑VV, DPc‑SD, DPc‑VV,
  BDr‑SD, ADCH, DIA1/DIA1a‑c/DIA2…, BLACK BEADS, MIX STONES, CUSTOMER
  DIAMONDS.
  - Unit is Ct or Gm.
  - Loose stones are held in **packets** ("Round Diamonds", "VVS1 Quality").
- **Alloy master.** "22 CT 8%": purity and alloy %.
- **Rates.** Kept daily per carat (24/23/22/18) as a **Sale** and a
  **U.R.D.** (buy-back) rate, plus Silver and Platinum Sale/URD.
- **Customer.** Name, Address1/2, City, Pincode, PhoneNo, MobileNo, Email.
  - **No customer code is visible.** Identity is name + address/phone.
  - Birthday and anniversary exist (they drive SMS) but the field screen
    wasn't seen.
- **Parties.** Supplier, Karigar/GoldSmith (numeric code), Melter, Assayer
  and Refiner. Departments are parties too.
- **Ledger accounts.** A Tally-like group tree (Capital, Current Liabilities,
  Loans, Sundry Creditors/Debtors, Fixed Assets, Investments, Current Assets ▸
  Bank/Cash/Loans & Advances…).
  - The account code is embedded in the name ("100- BANK OF MAHA.").
  - Inter-branch accounts are split **per metal** ("C/o Paud Gold",
    "C/o Paud Silver").
- **Employees / salesmen.** Code, photo and fingerprint. Commission is a
  rate per gram by doc type or group. Monthly targets are set per
  location × item × salesman.
- **Bhishi (savings scheme) master.** Description, Duration (months),
  Additional months before maturity, Discount type (1.AdditionalInstallment
  / %), Installments given in discount, and Related ledger account.
- **Gift voucher denominations** (100/150/250/500/1000/5000 Rs).
  **Loyalty cards** (Card No, Valid Upto, Points, Reference).

### Stock identity
- **Per-piece labels (tags).**
  - Label No is numeric (197 … 6-digit 437814) and **unique across the company**.
  - Barcode = item code + zero-padded label (`DBN-0031510`), or alphanumeric (`PDS1`, `banz168`).
- **What a label carries:**
  - item, category, purity (CT), pcs, gross / net / stone wt, wastage %;
  - stone lines (code, unit, pcs, wt, rate, amount, colour/clarity/cut);
  - diamond wt/pcs and colour-stone wt/pcs;
  - making (amount or `@N/G`);
  - supplier/karigar, design no, designer, hallmark flag, KDM flag;
  - up to 4 photos, MRP, current location, status.
- **Weight stock** (bullion, old ornaments, URD gold, bars) is held by
  weight + purity with no label.
- **Labelling voucher** (`LB`/`LVG`) converts weight stock at `LABELING`
  or `Safe` into labels at a counter. It can create N labels per line.
- Stock reports count **Pcs and Lbl** separately, and **Gross and Net** separately.

### Documents
- **Document types** are rows in `DocumentTypeMaster`. There is one per
  branch (e.g. "1.Sales Bill (LR)").
- **Document numbers** are a **prefix + integer**, stored as two fields.
  They print as `LRS-1496`, `LRS1510` or `LRS | 1464`.

| Area | Documents (prefix examples) |
|---|---|
| Sales | Gold Sales Bill `GS`, Sales Bill (LR) `LRS`, Order Sales Bill `OS`/`LOS`, Sales Return `SR` |
| Old gold | URD Purchase `UP`/`LUP`. Net = Gross − Ghat; amount = net × URD rate. Cash above ₹20k is blocked. |
| Purchase | RD Purchase `RD`/`RDP` (supplier bill no, challan, VAT type, due date), Purchase Return |
| Orders | Customer Order / Awak `CO`/`LAW`/`CHAW`, Metal Jama `AG`, Advance Jama `AA`/`LAD`, Metal Return `GR`, Advance Return `AR`/`LAR`, Order Booking |
| Karigar | Karagir Slip, Karagir Nave (issue) `KN`, Karagir Jama (receipt) `KG`/`LRK`, Smith Stones Issue `SSI` / Broken `SSB`/`GBS`, Shop-sample issue/receipt, Issue Std Bar `IG`, Receipt `RG`, Refinery Issue/Receipt `LRN`/`LRK`, Casting/Filing/Pre-polish `CI/CR/FI/FR/PP/PR`, Melting/assay/refining reallocation |
| Stock | Labelling `LB`/`LVG`, Stock Transfer `ST` (two-step: the receiver must **Pass** it), Approval issue/receipt `APRP`, Physical Stock Taking `PDPS`, Closing Stock Entry/Checking |
| Schemes | New Bhishi Entry `LBO` (enrolment no = member no), Bhishi Installment `LBI` (with Installment No), PDC against scheme, maturity |
| Vouchers | Gift Voucher Sale `VSLR` (serial ranges), Transfer `VTHO`, Loyalty Card Issue `AVLI` |
| Accounts | Cash Receipt `CR`, Cash/Bank Payment, Bank Receipt, Accounting Voucher `JV`/`DA`, Cheques Deposited `PCD`, Opening Balance (`O1`, `Ope1` bill-wise) |

### Sales bill payment modes (exact dropdown)
`1.Cash 2.Credit 3.CreditCard 4.Cheque 5.Gift Voucher(Old) 6.Gift Voucher(New) 8.URD Voucher 9.Sales Return`

There is no 7. Card payments carry type, charges, card no and auth no.
Cheques carry bank, branch, cheque no, date and our bank.

### Formulas confirmed against on-screen numbers
- **Sale line** = Net × Rate + Making (+ Stone Amt). Making is per gram or a lump sum.
- **Stone weight:** 1 ct = 0.2 g. Net = Gross − (stones in g + ct × 0.2).
- **Fine weight** = Net × CT/24. Karigar "pure" = Net × CT/24 + Net × wastage %.
- **Karigar issue (Nave)** = Net + Alloy. **Receipt (Jama)** = Net + Tut.
  Wastage and Chura are tracked separately.
  - Balance = Σ Nave − Σ Jama, per metal, in grams.
  - Labour is paid net of TDS (2.25% in the demo).
- **Order:** New Metal = ordered net − metal deposited (Jama). The advance
  is deducted at delivery.
  - Each order keeps a running **metal balance** and **advance balance**
    across the linked AG/AA/GR/AR vouchers.
- **Discount** = Net Amount − cash actually received. A branch manager has
  to "pass" it. Discounts, credits, cheques, cards, cancellations,
  other-amounts and scheme maturities all go through a maker–checker
  ("passing") step.

### Wholesaler and manufacturer customers

The wholesaler and manufacturer demos (uploaded 2019) show the **same
2007–09 desktop builds**, still VAT-era. What they add:

**A separate "Wholesale Diary" program**
- Its own menus: Masters / Transactions / Reports / House Keeping /
  **Import Data**. It probably keeps its own data store, so plan for a
  second extraction.
- It keeps every party (customer or karigar) as a **weight + amount
  ledger**. Each entry carries Net wt, Purity/Touch, Wastage %, Pure
  (fine) wt, Stone wt and value, Amount and Ref No, plus interest postings
  and weight↔amount conversion entries.
- Separate stone ledgers per party.
- **It can purge transactions up to a "settlement date"** and restart from
  final balances, so history may not exist even in a backup.

**Rate cutting**
- Unfixed-rate trading: **Rate Cutting Sales `RCS`** and **Rate Cutting
  Purchase `RCP`**. They convert a party's open metal balance to money at
  an agreed rate.
- Formulas: Pure = Wt × Touch/100; Amount = Wt × Rate (+ Making, + VAT).
- The Goldsmith Account Ledger shows Metal Wt, Touch, Pure Wt, Metal Rate,
  Labour, Cash and Total for each entry.

**Purity and wastage**
- Purity appears **as CT (22.00) on some screens and as % touch (92.00)
  on others**.
- Labels carry a **Wastage %** for touch-plus-wastage billing: Fine = Net ×
  (touch + wastage)/100 (inferred).

**Manufacturing**
- Departments are rows of `LocationMaster`, with ShortName, Group and Level
  No (Model Making, Casting, Filing, Pre-Polish, Study (= Studding),
  Quality, Redbox…).
- **Job Creation `JC`** sets up one job per ornament. **Bulk Order Receipt
  `Borv`** handles stock-only orders, with no job number.
- **Process issue/receipt pairs**: `MK`, `CI`/`CR`, `FI`/`FR`, `PP`/`PR`,
  and in v5 the numbered types `PO`, `OIC`, `TR`, `CTO`, `FTP`, `PPR`,
  `PTF`.
  - Issue lines carry Alloy.
  - Receipts carry **Wastage, Ghat, Tut, Chura**.
  - Net = Gross − Ghat − stones.
  - A Tracking Sheet (job card) records a stage-wise Loss A/C, plus Return
    Stones and Broken Stones A/C.
- **Department ledgers** hold metal and stones (issue / receipt / broken /
  closing, in carats per stone).
- **Design / catalog master**: DesignNo, description, supplier, approx
  weight/price, making rate, **making days**, a stone BOM per design, and 4
  images.
- `Select From Masters` gives the internal table names: AccountMaster,
  Alloy Master, CityMaster, CompanyMaster, CustomerMaster, EmployeeMaster,
  LocationMaster, PartyBankMaster, ProductMaster, PurityMaster,
  StandardDescriptionMaster, VatTypeMaster…

**Importer traps**
- A document prefix does not identify a document type (`FR` is used for
  two different ones).
- Order numbers are case- and format-inconsistent (`jc12` / `JC12` /
  `JC-12`).
- Master rows can be **cancelled** rather than deleted ("Show Cancelled"),
  so filter them out.
- Some report footers sum percentages, which makes them meaningless as
  control totals.
- Images are stored as `\acmewin\images\IMG` + 6-digit prefix + 7-digit
  zero-padded label + `.Jpg`.
- Multi-year FY spans (15–21 months) occur in real data.

---

## 3. What a customer must hand over at cutover

Pick a **cutover date** (ideally FY start, 1 April, or month-end). Freeze
entries, then collect the following.

### A. Preferred (on-premise)
With the customer's written consent:
- a `mysqldump` of the current-year Infinity database (plus the previous
  year if history is wanted), or their latest auto-backup;
- the `Images` folder.

We convert these ourselves.

### B. Baseline
The customer runs these reports in Infinity *as on the cutover date*, for
**all locations** (not consolidated where a per-location option exists), and
clicks **Save To Excel**:

| # | Infinity report (menu path) | Gives us |
|---|---|---|
| 1 | Stock ▸ *Labelwise Stock For An Item With Filters* / *Itemwise Label Details* (all items) | Every label in stock: label no, pcs, carat, gross, net, labour, location, category |
| 2 | Stock ▸ *Item Labeling Stock Report With Supplier Name* and *Stone Search Report* (no filter) | Stone lines per label, plus supplier |
| 3 | Stock ▸ *Itemwise Stock Summery Report* / *Locationwise Stock Summery Report* | Unlabelled weight stock per item × location (bullion, old gold, bars) and **control totals** |
| 4 | Stock ▸ *Stone Stock Summery Report*, *Itemwise Packetwise Balances* | Loose stones and packets |
| 5 | GoldSmith ▸ *Goldsmith Transaction Summary* (each metal) | Opening/closing gross & net per karigar per metal |
| 6 | Pending Order ▸ *Orders Pending With Karagir*, *Shop Samples Pending With Goldsmith* | Items physically with karigars |
| 7 | Pending Order Reports (all pending customer orders) plus *Show Order Status* for each open order | Open orders with metal & advance balances |
| 8 | Accounting ▸ Trial Balance (opening/closing Dr/Cr), and *Accounts Under Selected Group* for Sundry Debtors and Sundry Creditors | Party balances, plus control totals |
| 9 | Payment Follow-up ▸ *All Due Receipts* | **Bill-wise** open receivables (bill no, date, amount, balance) |
| 10 | Bhishi Reports (members, installments paid, maturity) | Scheme liabilities |
| 11 | Gift Voucher ▸ *Available Gift Voucher Stock*, plus the sold-but-unredeemed list | Outstanding vouchers |
| 12 | General ▸ *Master Entry Reports* (customers), *Mailing List Program* export | Customer master with phones/addresses |
| 13 | Today's Rates screen (screenshot or entry) | Opening metal rates |
| 14 | *Stock Summary Report As On* (Gold, Silver…) | **The master control total**: Closing = GS-11 book + GS-12 book + Karagir balance − Alloy − Pending Awak |
| 15 | *Closing Stock Checking* for the cutover date | Per counter Pcs / Labels / Gross / Net. Every counter must be passed and locked first. |
| 16 | *Agewise Analysis Of Available Stock*, *Supplierwise Stock And Sales* | Label stock-in dates (needed for ageing) and per-supplier totals |
| 17 | *Datewise Goldsmith Ledger* / *Smith Closing Balance Summary*, plus melter / assayer / refiner / polisher ledgers | Metal still with every outside party, per product group |
| 18 | *Karagir Charges Settlement* (Pending tab) | Unpaid karigar labour |
| 19 | *List Of Debtors* (bill-wise, with due date and days) | Bill-wise receivables (alternative to #9) |
| 20 | Saving-scheme PDC list / *Cheque Deposit System* (pending) | Undeposited post-dated cheques |
| 21 | Cashier opening/closing (*Lock Cashiers*) | Cash per cashier at cutover |
| 22 | *Pending Indents For Branch*, open Purchase Orders, supplier on-approval stock | Open procurement |
| 23 | Money Lending (if used): open loans with pledged items | Gold-loan assets and pledged ornaments |
| 24 | Reorder master (Purchase Order ▸ item details) | Min stock / reorder level per location × item × purity × weight band |
| 25 | Wholesale Diary ▸ *Ledger Summary (For Both)*, *Fine Weight Summary*, *Stone Summary* | Every party's metal (fine) + amount + stone balance, for wholesalers |
| 26 | *Goldsmith Account Ledger* / department ledgers with Diamond Summary | Metal and stones at each karigar or department (WIP), for manufacturers |
| 27 | Open Job Creation / Party Order list with *Show Order Status*; *Design NoWise Stock*; Catalog of Ornaments | Open jobs (with stage), and the design master with its stone BOM |

**Before running any report**, the customer should:
- pass every unpassed document;
- lock all cashiers;
- run the reports for the business **Open Date**, which Infinity keeps
  separately from the PC date.

The customer should also send screenshots of: the **Export-Import** menu, the
Bhishi and Loyalty masters, and the Help ▸ About version.

### C. Fallback
Our own **canonical Excel templates** (one per entity). Staff can fill them by
hand or by pasting from any of the reports above.

---

## 4. Mapping to RatnaLekha

| Legacy | RatnaLekha target | Notes / gap |
|---|---|---|
| Company / FY | `Store`, `BusinessSettings.financialYearStartMonth` | 1 company = 1 Store. |
| Branch / Location / Counter | `StoreLocation` (`@@unique([storeId,name])`) | **Gap:** flat list with no branch → counter hierarchy. Option: name as `Laxmi Road / Counter A`. Virtual locations (Approval, Order Box, Karigar) map to `InventoryStock.status` instead. |
| Product group tree, metal | `StoreMetal`, `StoreMetalPurity` | CT → fineness % = CT/24×100 (23 CT → 95.83). Match on fineness, never on the fixed `PurityType` enum. |
| Category (making basis) | `Product.defaultMakingChargeType` + `StoreCategory` | Split the overloaded legacy Category: making-basis tokens become the charge type; the rest becomes `StoreCategory`/`StoreCategoryType`. |
| Item (Particulars) | `Product` (`@@unique([storeId,productCode])`) | productCode = legacy item short code, or a slug of the name. Strip numeric prefixes into `designCode`. |
| Item attributes / stone attrs | — | **Gap:** no generic attribute store; no stone clarity/colour/cut. |
| Stone codes | `StoreMetal(isGemstone)` + `StoreMetalOrigin` | Free-text `stoneTypeNames` on the line. **Gap:** no packet stock for loose stones. |
| Label / tag | `InventoryStock` (`stockCode`, `tagNumber` unique) | `tagNumber` = legacy Label No, `stockCode` = barcode. Weights, purity, making, location, vendor. **Gap:** the existing stock import ignores weights and tag numbers and writes no `OPENING` transaction. |
| Label stone lines | `ProductStoneComponent` is per *Product*, not per tag | **Gap:** per-tag stone breakdown (only scalar `stoneWeight`, `caratWeight`, `stoneCharge` on the tag). |
| Label photos | `Product.imageUrls[]` | **Gap:** per-tag images. |
| HUID / hallmark flag | — | **Gap.** |
| Weight stock (bullion, old gold) | `InventoryStock` with qty 1 and weight | Acceptable; one row per item × purity × location. |
| Customer | `Customer` (`@@unique([storeId, phone])`) | **Duplicate phones in legacy data will collide.** Dedupe or move the second phone to `alternatePhone`. No legacy code exists, so generate `customerCode`. |
| Supplier | `Customer(isSupplier)` | |
| Karigar | `Karigar` (`openingGold`, `openingCash`) | **Gap:** opening is one gold scalar. Silver and other metals need ADJUSTMENT `LedgerEntry` rows with `metalTypeId` + `metalWeightFine`. |
| Party money opening | `Customer.openingBalance` | Loses the bill-wise detail. Better: one opening `Invoice` per open bill (status PARTIAL, balance) so ageing and follow-up keep working. |
| Open customer orders | `DraftOrder` + `DraftOrderItem` + PAYMENT_IN `LedgerEntry(draftOrderId)` | **Gap:** no metal-deposit (Jama) balance on an order; the advance isn't auto-applied at billing. |
| Items with karigar | `KarigarJob` (status issued) + `InventoryStock.status = ISSUED_TO_KARIGAR` | |
| Bhishi / saving schemes | — | **Gap: no model.** It is a real liability and must be migrated. |
| Gift vouchers | — | **Gap: no model**, and no payment method for vouchers. |
| Loyalty cards | — | **Gap** (low priority). |
| Salesman | — | **Gap:** no salesman on invoice lines. `Employee` isn't store-scoped and needs a User. |
| GL accounts / Trial Balance | — | **Gap:** RatnaLekha's ledger is party-based only, with no chart of accounts. Import party balances only; give the customer the TB for their CA/Tally. |
| Rates | `MetalRate` (fixed columns gold24k/22k/18k/14k, silver, platinum95) | 23 CT has no column. Seed only the opening rates. |
| Label stock-in date, purchase cost | `InventoryStock.purchaseDate`, `purchaseAmount` | Already fits. The importer must fill both so ageing and margin reports work. |
| Customer Area / locality | — | **Gap** (Infinity has an Areawise Sales report). It could go into `addressLine2` or a new field. |
| Mailing list (numeric code, prefix, company, designation, activity log) | `Customer` | Use the mailing code as `legacyRef`. The activity log has no home. |
| Melter / assayer / refiner / polisher metal balances | `Karigar` (treat them as karigar-type parties) | Same per-metal opening gap as karigars. |
| Sub-karigar | — | **Gap** (karigar → sub-karigar). |
| Pending karigar labour (asking vs making) | `LedgerEntry` CREDIT to the karigar | OK as an opening cash balance. |
| Cashier cash balances | — | **Gap**: no cashier/till model. Import as one opening cash figure. |
| Saving-scheme PDCs | — | **Gap**: part of the scheme module. |
| Reorder master, branch indents, POs | — | **Gap**: no replenishment module. |
| Supplier on-approval stock | `InventoryStock` (status?) | **Gap**: needs a "not owned / on approval" status. |
| Sets / part-sold sets | — | **Gap**: no set grouping of labels. |
| Money Lending (girvi) | — | **Gap**: a separate module. |
| Customer / supplier **fine-metal and stone balances** (wholesale) | `LedgerEntry` with `metalTypeId` + `metalWeightFine` on `customerId` | Possible today, but there is no opening-metal field and no UI showing a customer's metal balance. **Gap** for wholesalers. |
| Rate cutting (RCS/RCP) | — | **Gap**: no unfixed-rate / metal-to-money conversion document. |
| Label wastage %, touch-based purity | `InventoryStock.wastagePercent`, `StoreMetalPurity.finenessPercent` | Fits, but the importer must normalise CT vs % touch. |
| Departments / WIP per process stage | `StoreLocation` + `KarigarJob` | **Gap**: no department WIP ledger, no per-stage loss (ghat/tut/chura). Import WIP as karigar-type balances. |
| Job card / work order with stages | `KarigarJob` | Partial: no stage history. Import only the open jobs, with their current stage. |
| Design master with stone BOM, making days | `Product` (`designCode`, `ProductStoneComponent`) | Mostly fits if each design becomes a Product. Making days is a **gap**. |
| Historical bills | `Invoice` / `InvoiceItem` | Optional, read-only "legacy history" import. Only possible via backup files (path A), since reports give summaries, not line detail at scale. |

---

## 5. What to build in RatnaLekha

### Phase 0: foundations (all later work needs this)
1. **Schema additions.** This is one hand-written migration. *The Neon DB is
   shared with production, so it needs an explicit go-ahead before applying.*
   - `ImportBatch` (storeId, source `ACME_INFINITY`, kind, fileName, status
     STAGED/COMMITTED/ROLLED_BACK, counts, createdBy, cutoverDate, report JSON).
   - `legacyRef String?` + `importBatchId String?` on Customer, Karigar,
     Product, InventoryStock, DraftOrder, Invoice and LedgerEntry, plus
     `@@unique([storeId, legacyRef])` where it makes sense. This gives
     idempotent re-runs and one-click rollback of a batch.
   - `LedgerSourceType.OPENING`.
   - Per-tag `InventoryStockStone` (stone metal/origin, pcs, carat, weight,
     rate, amount, colour, clarity, cut).
   - `InventoryStock.imageUrls[]` and `huid`.
2. **Migration module** (`/settings/migration`, ADMIN only, new
   `PERMISSIONS.DATA_MIGRATION`).
   - Flow: Upload → detect report type → column mapping (auto, editable) →
     validate → **preview with errors per row** → commit in one transaction
     per batch → reconciliation report.
   - Reuse `parseExcelUpload`, but it must read **all sheets and raw cell
     grids**, not just header-keyed rows.
3. **Acme report-export parser** (`lib/migration/acme/`), in pure functions
   with unit fixtures. It needs to handle:
   - title/company/"From … To …"/"Location :" preamble rows before the header (auto-locate the header row);
   - two-level headers (Opening/Addition/Closing over Pcs/Gross/Net);
   - fill-down of group keys (Item Name only printed on a group's first row);
   - group-header rows and "Total"/"Sub Total"/"Grand Total" rows (skip them, but keep them as **control totals**);
   - stacked cells (Gross over Net, Pcs over Lbl) and continuation rows with a blank Doc No;
   - `d/mm/yyyy` dates, 3-dp weights, `Dr`/`Cr` suffixes or signed balances, `@100/G` making notation, `PREFIX-123` doc numbers;
   - CT purity (23.00) vs % purity (92.000).

### Phase 1: masters
Locations, metals/purities, categories, products (items), stones, customers
(with phone dedupe), suppliers and karigars. Several existing importers
can be extended rather than rewritten.

### Phase 2: opening position (the cutover essentials)
- **Opening stock per label**, with stone lines, weights, making, location
  and status, and an `InventoryTransaction(OPENING)`. Weight-stock rows
  are imported too.
- **Image bulk-attach.** Upload a zip of `IMG*.Jpg` files and match each
  to `tagNumber` by its trailing digits.
- **Party balances bill-wise.** Each open bill becomes an opening Invoice
  with its balance; any residual goes to `openingBalance`.
- **Karigar metal and cash balances** per metal. Items with karigars
  become `KarigarJob`s.
- **Open customer orders** with advance (PAYMENT_IN) and metal deposit.
  The metal deposit needs a field or ledger entry.
- **Reconciliation screen.** It shows our totals against the legacy
  control totals: labels, pcs, gross and net per item × location;
  Σ debtors; karigar fine balances; open order advances. A batch can only
  be marked "accepted" when they match.

### Phase 3: liabilities without a home yet
These are new modules, each with its own UI, and need product decisions:
- Saving schemes (Bhishi): plan, member, installment and maturity.
- Gift vouchers: denomination, serials, status, and a payment method.
- Salesman on invoice.

### Phase 4 (optional): history
Read-only legacy invoices and URD purchases, for customer lookup
("Previous Transactions For Customer"). Only feasible from backup files.

### Also worth doing for sales
Match the familiar Infinity workflows that customers will look for:
- URD (old gold) purchase / exchange with Ghat deduction;
- Sale vs URD daily rates;
- split tender including gift voucher and URD voucher;
- the order metal-deposit balance;
- branch-manager "passing" of discounts and credits;
- the ₹20k cash limit on URD purchases.

---

## 6. Open questions to settle with the first migrating customer
1. Exact Infinity version (Help ▸ About; the current one is 11.220), edition
   (on-premise or cloud), and what's under **Export-Import**.
2. Can they give us a MySQL dump? Do they have the MySQL password, or does
   Acme hold it? Is the backup protected with a security code?
3. Number of branches; do they want one Store per branch or one Store with
   locations?
4. Do they still run Bhishi / gift vouchers / loyalty? How many active
   members, and what liability amount?
5. Customer master size, and how many duplicate phones there are.
6. Is GST already live in their build (HSN, GSTIN on bills)?
7. History depth required: balances only, or past bills too? (Acme's own
   FAQ says it converts only "stock, vendor and customer data" from other
   software, so balances only is the industry norm.)
8. Do they use Money Lending, RFID, sets, on-approval purchases, or
   reorder/indents?

## 7. Raw evidence
The working set (frames, per-video catalogues, transcripts) lives outside
the repo in the session scratchpad. Re-download the playlist with
`yt-dlp` and extract frames with
`ffmpeg -vf "select='gt(scene,0.12)'" -fps_mode vfr` if it needs re-checking.
