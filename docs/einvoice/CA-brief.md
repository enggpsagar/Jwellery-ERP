# E-Invoice integration: points for CA review

**From:** Swarna Suite (jewellery billing software) development team
**Purpose:** We are about to connect our billing software to the Invoice
Registration Portal (IRP) so that B2B invoices get their IRN automatically.
Before building it, we need your confirmation on how our jewellery invoices
should be reported. Your answers decide how the software builds every
e-invoice, so please mark each point "Agree" or give the correct treatment.

## Attached

| File | What it is |
| --- | --- |
| `sample-einvoice-INV01.json` | A sample e-invoice exactly as our software would send it to the IRP (INV-01 schema, version 1.1). |
| `sample-einvoice-INV01-annotated.json` | The same file, with each line's internal breakdown (metal value, making, hallmark, stone, discount, weight, rate) added under `_appBreakdown` so you can see how every figure was built. That key is not sent to the IRP. |

The sample is a B2B intra-state sale (Maharashtra to Maharashtra) with two
items. GSTINs, names and addresses are **dummy values**.

| | Item 1: 22K Gold Chain | Item 2: 18K Gold Ring with Diamond |
| --- | --- | --- |
| Net weight × rate | 10.000 g × ₹6,200 = ₹62,000 | 4.200 g × ₹5,100 = ₹21,420 |
| Making charge | ₹4,500 | ₹3,000 |
| Hallmark charge | ₹45 | ₹45 |
| Stone (0.50 ct diamond) | none | ₹30,000 |
| Line discount | ₹500 | none |
| **Taxable value** | **₹66,045** | **₹54,465** |
| GST 3% (CGST 1.5% + SGST 1.5%) | ₹990.68 + ₹990.68 | ₹816.98 + ₹816.98 |

Invoice total: taxable ₹1,20,510 + CGST ₹1,807.66 + SGST ₹1,807.66
− invoice discount ₹1,000 − round-off ₹0.32 = **₹1,23,125**.

## How the software calculates GST today

For each invoice line:

> **Taxable value = (net weight × rate per gram) + making charge + hallmark charge + stone charge − line discount**

GST is charged on that at **one rate per line** (3% by default), split
CGST + SGST within the state, or IGST for an inter-state sale. A discount
given on the **whole invoice** is currently deducted **after** GST.

## Questions for you

For each point, the answer we have assumed in the sample is shown in italics.

1. **Making charges.** Are making charges part of the value of the jewellery,
   taxed at the jewellery rate (3%), rather than shown as a separate service
   line? *Assumed: part of the jewellery value, 3%.*

2. **Hallmarking charges.** Should the BIS hallmarking charge collected from
   the customer be included in the jewellery value at 3%, or reported as a
   separate item with its own SAC and rate? *Assumed: included, 3%.*

3. **Stone-studded jewellery.** For a gold ring set with a diamond, is the
   whole piece one item (HSN 7113, 3%), or must the diamond be reported as a
   separate item with its own HSN and rate? *Assumed: one item, 3%.*

4. **Loose stones / diamonds sold on their own.** Which HSN and GST rate
   should we use (e.g. cut and polished diamonds vs other precious stones)?
   *Not in the sample; we need your guidance.*

5. **HSN code and digits.** Is `71131910` correct for gold jewellery? What
   code should be used for silver and platinum jewellery? Are 8 digits
   required, or will 6 do for our clients' turnover band?

6. **Quantity and unit.** Should each piece be reported as **1 NOS** (unit
   price = full piece value, weight given in the description, as in the
   sample)? Or as **weight in GMS** (quantity = net weight, unit price =
   value per gram including making charges)? *Assumed: 1 NOS per piece.*

7. **Discount on the whole invoice.** The software currently deducts it
   **after** GST, so GST is charged on the undiscounted value. Should it
   instead reduce the taxable value before GST (spread across the items)?
   *Sample follows the current behaviour, so please confirm or correct.*

8. **Line discount / scheme discount.** Is it correct that it reduces the
   item's taxable value before GST (as in item 1)? *Assumed: yes.*

9. **Old gold exchange.** When a customer gives old gold as part-payment,
   how should it appear? For example, as payment only (no effect on the
   e-invoice), or as a deduction from value? *Not in the sample.*

10. **Which invoices need an IRN.** Please confirm that only these need an
    IRN: B2B invoices (buyer has a GSTIN), exports, and supplies to SEZ,
    plus the related credit/debit notes. Sales to consumers (B2C) don't.
    Confirm the current threshold (aggregate turnover above ₹5 crore) and
    whether the 30-day reporting limit applies to our clients.

11. **Composition scheme clients.** Confirm that clients registered under
    the composition scheme are outside e-invoicing.

12. **Cancellation.** After 24 hours an IRN can't be cancelled, so a
    credit note is issued instead. Confirm that the credit note must itself
    be e-invoiced (document type CRN), referring to the original invoice.

## What else we need

- Any other charges your clients commonly put on a jewellery invoice (for
  example packing, certification or insurance) and how each is taxed.
- A real, anonymised B2B invoice from one client that you've already
  e-invoiced, if possible. We will reproduce it in the software and match
  it field for field.
