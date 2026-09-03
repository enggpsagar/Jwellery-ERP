import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Platform-wide FAQ content for the /contact-faq page (and the public
// /faq page it shares content with) — one-time seed since the table was
// empty. `answer` is TipTap HTML (see components/shared/rich-text-editor.tsx),
// so entries are written as real HTML, not plain text.
const FAQS: { question: string; answer: string }[] = [
  {
    question: "What is Swarna Suite?",
    answer:
      "<p>Swarna Suite is a business management platform built specifically for jewellery stores — customers and vendors, products and stock, purchases, Karigar (goldsmith) job tracking, quotations, billing, and a full ledger, all in one place, with fine-weight math built around how gold and silver are actually traded.</p>",
  },
  {
    question: "What are the different user roles, and what can each one do?",
    answer:
      "<ul><li><strong>Super Admin</strong> — manages the whole platform: every store, subscription plans, and this Contact &amp; FAQ content.</li><li><strong>Admin</strong> — full control of their own store: settings, taxonomy, purity table, users, and every record.</li><li><strong>Staff</strong> — day-to-day selling, billing and inventory. An Admin chooses exactly which sections a Staff member can open, and which branches/locations they can see.</li><li><strong>Karigar</strong> — signs in and sees only their own assigned jobs under My Jobs. Nothing else in the application is reachable.</li></ul>",
  },
  {
    question: "How is a Product different from a Stock entry?",
    answer:
      "<p>A <strong>Product</strong> defines the design — metal, purity, default making/stone charges, and typical weights. A <strong>Stock</strong> entry is one physical piece made to that design, with its own actual weight, a printable QR tag, and a status (in stock, sold, etc.). One product can have many stock pieces.</p>",
  },
  {
    question: "What happens to stock when I record a Purchase?",
    answer:
      "<p>Recording a purchase from a vendor automatically creates a stock entry for each line item — you don't add stock separately afterward. Anything left unpaid on that purchase posts to the vendor's own ledger as money you owe them.</p>",
  },
  {
    question: "What's the difference between a Quotation and an Invoice?",
    answer:
      "<p>A Quotation is a price you've given a customer — nothing moves yet: stock isn't touched and nothing posts to the ledger. Converting a quotation to an invoice is the one step that actually marks the stock sold and posts the balance due.</p>",
  },
  {
    question: "What's the difference between a Kacha slip and a Pakka invoice?",
    answer:
      "<p>A <strong>Kacha slip</strong> is a quick, provisional sale record — useful when the paperwork isn't ready yet. A <strong>Pakka invoice</strong> is the formal, final document. You can convert a Kacha slip into a Pakka invoice once you're ready, and the two stay linked so the trail is never lost.</p>",
  },
  {
    question: "How does Karigar (goldsmith) job tracking work?",
    answer:
      "<p>You issue raw material (gold, silver, or a stone) to a Karigar against a job, and receive finished pieces back later — partial receiving is supported, so a job stays open until the full quantity issued has been accounted for. Wastage folds into the fine weight credited back, so a job's closing balance actually reconciles against what was issued rather than reading as unexplained missing metal.</p>",
  },
  {
    question: "Why does the Karigar Ledger show \"Fine Gold\" for one Karigar and \"Fine Silver\" for another?",
    answer:
      "<p>The label always reflects whichever metal that specific Karigar's jobs actually use — gold, silver, or whatever else you've configured — rather than always saying \"gold\" regardless of the real material.</p>",
  },
  {
    question: "What are the three GST types, and how do I choose the right one?",
    answer:
      "<p>Your store's overall GST registration (set in Settings) is one of:</p><ul><li><strong>Retailer (B2C)</strong> — full GST charged and shown on every invoice.</li><li><strong>Wholesaler &amp; Manufacturer (B2B)</strong> — same GST collection as B2C.</li><li><strong>Small Local Jeweler (Composition Scheme)</strong> — GST can never be shown or collected as a line item; documents print as a Bill of Supply, and purchases are never eligible for input tax credit.</li></ul><p>Separately, each individual Customer or Vendor can be marked GST-registered (Not Registered / Regular / Composition) — since a store's own registration doesn't force every customer or vendor to share it.</p>",
  },
  {
    question: "Does my store's GST scheme affect what a vendor charges me on a Purchase?",
    answer:
      "<p>No — a purchase's GST is whatever the vendor's own registration allows them to charge (their own Regular vs. Composition status), independent of your store's scheme. Your store's own Composition status only affects whether you're eligible to claim that GST back as input tax credit, not whether it appears on the bill at all.</p>",
  },
  {
    question: "What is the Ledger, and how is it different from Reports?",
    answer:
      "<p>The Ledger shows every credit/debit movement across customers, vendors and Karigars as it happens, plus a metal-wise daily view of what was bought and sold with a running closing balance. Reports summarise the bigger picture over time — revenue, outstanding balances, stock value, open jobs, and the full fine-metal flow (purchased, issued, received, wastage, sold, remaining) — exportable to Excel or CSV.</p>",
  },
  {
    question: "How does Multi-location / branch access work?",
    answer:
      "<p>An Admin can run several counters or branches under one store, and grant each Staff member access to only the locations they actually work at. A location-restricted Staff member only ever sees records — invoices, purchases, stock — tagged to a location they have access to.</p>",
  },
  {
    question: "What is Scan to Sell?",
    answer:
      "<p>Every stock piece gets a printable QR label. Scanning it with a phone camera at the counter pulls up that exact piece's details already filled in — pick the customer, enter the price, confirm, and the invoice is raised with the stock marked sold in one step.</p>",
  },
  {
    question: "Can I record a diamond or gemstone product by carat instead of weight?",
    answer:
      "<p>Yes — for a Diamond or Stone product, the Carat and Weight fields convert automatically in both directions (1 carat = 0.2 grams), whether you're creating a product, recording a purchase, or raising an invoice or quotation. Under Settings → Taxonomy, each stone type (Diamond, Ruby, Emerald, and so on) can also be marked Natural or Lab-Grown.</p>",
  },
  {
    question: "Who can edit the content on this Contact &amp; FAQ page?",
    answer:
      "<p>Only a Super Admin can edit the Contact Us message or manage FAQ entries — this content is platform-wide, the same for every store and every visitor, not a per-store setting.</p>",
  },
];

async function main() {
  const existing = await prisma.platformFaq.count();
  if (existing > 0) {
    console.log(`platformFaq already has ${existing} row(s) — aborting so nothing gets duplicated.`);
    return;
  }

  for (let i = 0; i < FAQS.length; i++) {
    await prisma.platformFaq.create({
      data: {
        question: FAQS[i].question,
        answer: FAQS[i].answer,
        position: i,
        isPublished: true,
      },
    });
  }

  console.log(`Created ${FAQS.length} FAQ entries.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
