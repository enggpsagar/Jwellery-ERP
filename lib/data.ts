export const stats = [
  {
    label: "Today's Sales",
    value: "₹8,42,500",
    change: "+12.4%",
    trend: "up" as const,
    sub: "vs. yesterday",
    icon: "rupee",
  },
  {
    label: "Monthly Revenue",
    value: "₹2.18 Cr",
    change: "+8.1%",
    trend: "up" as const,
    sub: "vs. last month",
    icon: "trending",
  },
  {
    label: "Outstanding Receivables",
    value: "₹46,90,000",
    change: "-3.2%",
    trend: "down" as const,
    sub: "across 38 accounts",
    icon: "wallet",
  },
  {
    label: "Gold Stock",
    value: "12,480 g",
    change: "+420 g",
    trend: "up" as const,
    sub: "22K & 24K combined",
    icon: "gold",
  },
  {
    label: "Silver Stock",
    value: "84,600 g",
    change: "-1,200 g",
    trend: "down" as const,
    sub: "fine & sterling",
    icon: "silver",
  },
  {
    label: "Pending Karigar Orders",
    value: "27",
    change: "+5",
    trend: "up" as const,
    sub: "6 overdue",
    icon: "hammer",
  },
]

export const monthlySales = [
  { month: "Jan", sales: 1820000, target: 1700000 },
  { month: "Feb", sales: 1640000, target: 1750000 },
  { month: "Mar", sales: 2110000, target: 1900000 },
  { month: "Apr", sales: 1980000, target: 2000000 },
  { month: "May", sales: 2340000, target: 2100000 },
  { month: "Jun", sales: 2050000, target: 2150000 },
  { month: "Jul", sales: 2480000, target: 2200000 },
  { month: "Aug", sales: 2710000, target: 2400000 },
  { month: "Sep", sales: 2390000, target: 2450000 },
  { month: "Oct", sales: 3120000, target: 2700000 },
  { month: "Nov", sales: 3480000, target: 3000000 },
  { month: "Dec", sales: 2980000, target: 2900000 },
]

export const revenueByCategory = [
  { category: "Gold Jewellery", value: 4820000, fill: "var(--color-gold)" },
  { category: "Diamond Sets", value: 2640000, fill: "var(--color-diamond)" },
  { category: "Silver Articles", value: 1380000, fill: "var(--color-silver)" },
  { category: "Coins & Bars", value: 980000, fill: "var(--color-coins)" },
  { category: "Repairs", value: 420000, fill: "var(--color-repairs)" },
]

export type Transaction = {
  id: string
  customer: string
  type: "Sale" | "Purchase" | "Repair" | "Advance"
  metal: "Gold" | "Silver" | "Diamond" | "Mixed"
  weight: string
  amount: string
  status: "Paid" | "Pending" | "Partial"
  date: string
}

export const transactions: Transaction[] = [
  {
    id: "INV-20481",
    customer: "Anjali Mehta",
    type: "Sale",
    metal: "Gold",
    weight: "42.5 g",
    amount: "₹3,18,750",
    status: "Paid",
    date: "19 Jun, 11:24 AM",
  },
  {
    id: "INV-20480",
    customer: "Rakesh Jewellers (B2B)",
    type: "Purchase",
    metal: "Silver",
    weight: "2,400 g",
    amount: "₹2,04,000",
    status: "Pending",
    date: "19 Jun, 10:02 AM",
  },
  {
    id: "INV-20479",
    customer: "Priya Nair",
    type: "Sale",
    metal: "Diamond",
    weight: "1.2 ct",
    amount: "₹1,46,500",
    status: "Partial",
    date: "18 Jun, 6:48 PM",
  },
  {
    id: "INV-20478",
    customer: "Suresh Patel",
    type: "Repair",
    metal: "Gold",
    weight: "18.0 g",
    amount: "₹4,200",
    status: "Paid",
    date: "18 Jun, 4:15 PM",
  },
  {
    id: "INV-20477",
    customer: "Deepa Krishnan",
    type: "Advance",
    metal: "Mixed",
    weight: "—",
    amount: "₹50,000",
    status: "Paid",
    date: "18 Jun, 1:30 PM",
  },
  {
    id: "INV-20476",
    customer: "Vikram Singh",
    type: "Sale",
    metal: "Gold",
    weight: "68.2 g",
    amount: "₹5,11,500",
    status: "Pending",
    date: "17 Jun, 5:55 PM",
  },
]

export type LedgerEntry = {
  id: string
  date: string
  dateISO: string
  customer: string
  customerInitials: string
  metal: "Gold" | "Silver"
  purity: string
  weightIn: number
  weightOut: number
  balance: number
  type: "Receipt" | "Issue" | "Sale" | "Purchase" | "Adjustment"
  rate: string
  reference: string
  notes: string
}

export const ledgerEntries: LedgerEntry[] = [
  {
    id: "GLD-30142",
    date: "19 Jun 2026",
    dateISO: "2026-06-19",
    customer: "Anjali Mehta",
    customerInitials: "AM",
    metal: "Gold",
    purity: "22K",
    weightIn: 0,
    weightOut: 42.5,
    balance: -42.5,
    type: "Sale",
    rate: "₹6,842/g",
    reference: "INV-20481",
    notes: "Bridal gold set delivered. Old gold exchange pending for next visit.",
  },
  {
    id: "GLD-30141",
    date: "19 Jun 2026",
    dateISO: "2026-06-19",
    customer: "Rakesh Jewellers (B2B)",
    customerInitials: "RJ",
    metal: "Silver",
    purity: "Fine",
    weightIn: 2400,
    weightOut: 0,
    balance: 2400,
    type: "Purchase",
    rate: "₹85/g",
    reference: "PO-1188",
    notes: "Bulk silver bar purchase. Quality assayed at 999 fineness.",
  },
  {
    id: "GLD-30140",
    date: "18 Jun 2026",
    dateISO: "2026-06-18",
    customer: "Suresh Patel",
    customerInitials: "SP",
    metal: "Gold",
    purity: "22K",
    weightIn: 18.0,
    weightOut: 0,
    balance: 18.0,
    type: "Receipt",
    rate: "₹6,840/g",
    reference: "OG-0457",
    notes: "Old gold received against ring resizing order. To be adjusted on billing.",
  },
  {
    id: "GLD-30139",
    date: "18 Jun 2026",
    dateISO: "2026-06-18",
    customer: "Priya Nair",
    customerInitials: "PN",
    metal: "Gold",
    purity: "18K",
    weightIn: 0,
    weightOut: 12.8,
    balance: -12.8,
    type: "Issue",
    rate: "₹5,610/g",
    reference: "KRG-771",
    notes: "Gold issued to karigar Mahesh for custom pendant fabrication.",
  },
  {
    id: "GLD-30138",
    date: "17 Jun 2026",
    dateISO: "2026-06-17",
    customer: "Deepa Krishnan",
    customerInitials: "DK",
    metal: "Silver",
    purity: "Sterling",
    weightIn: 0,
    weightOut: 640,
    balance: -640,
    type: "Sale",
    rate: "₹88/g",
    reference: "INV-20477",
    notes: "Silver pooja articles sold for Diwali order. Advance already adjusted.",
  },
  {
    id: "GLD-30137",
    date: "17 Jun 2026",
    dateISO: "2026-06-17",
    customer: "Vikram Singh",
    customerInitials: "VS",
    metal: "Gold",
    purity: "24K",
    weightIn: 100.0,
    weightOut: 0,
    balance: 100.0,
    type: "Purchase",
    rate: "₹7,180/g",
    reference: "PO-1187",
    notes: "24K gold coins purchased from authorised distributor. Hallmark verified.",
  },
  {
    id: "GLD-30136",
    date: "16 Jun 2026",
    dateISO: "2026-06-16",
    customer: "Lakshmi Iyer",
    customerInitials: "LI",
    metal: "Gold",
    purity: "22K",
    weightIn: 0,
    weightOut: 28.4,
    balance: -28.4,
    type: "Sale",
    rate: "₹6,838/g",
    reference: "INV-20474",
    notes: "Bangles set sold. Customer cleared full outstanding balance.",
  },
  {
    id: "GLD-30135",
    date: "16 Jun 2026",
    dateISO: "2026-06-16",
    customer: "Rohit Verma",
    customerInitials: "RV",
    metal: "Silver",
    purity: "Fine",
    weightIn: 1200,
    weightOut: 0,
    balance: 1200,
    type: "Receipt",
    rate: "₹84/g",
    reference: "OG-0455",
    notes: "Old silver utensils received for melting and re-make.",
  },
  {
    id: "GLD-30134",
    date: "15 Jun 2026",
    dateISO: "2026-06-15",
    customer: "Anjali Mehta",
    customerInitials: "AM",
    metal: "Gold",
    purity: "22K",
    weightIn: 15.2,
    weightOut: 0,
    balance: 15.2,
    type: "Adjustment",
    rate: "₹6,835/g",
    reference: "ADJ-0091",
    notes: "Weight adjustment for old gold exchange shortfall reconciliation.",
  },
  {
    id: "GLD-30133",
    date: "15 Jun 2026",
    dateISO: "2026-06-15",
    customer: "Suresh Patel",
    customerInitials: "SP",
    metal: "Silver",
    purity: "Sterling",
    weightIn: 0,
    weightOut: 320,
    balance: -320,
    type: "Issue",
    rate: "₹87/g",
    reference: "KRG-769",
    notes: "Silver issued to karigar for anklet pair fabrication.",
  },
]

export const ledgerCustomers = [
  "Anjali Mehta",
  "Rakesh Jewellers (B2B)",
  "Suresh Patel",
  "Priya Nair",
  "Deepa Krishnan",
  "Vikram Singh",
  "Lakshmi Iyer",
  "Rohit Verma",
]

export type Activity = {
  name: string
  initials: string
  action: string
  detail: string
  time: string
}

export const customerActivity: Activity[] = [
  {
    name: "Anjali Mehta",
    initials: "AM",
    action: "Completed a purchase",
    detail: "Bridal gold set · 42.5 g",
    time: "5 min ago",
  },
  {
    name: "Rohit Verma",
    initials: "RV",
    action: "New customer onboarded",
    detail: "KYC verified · Premium tier",
    time: "32 min ago",
  },
  {
    name: "Lakshmi Iyer",
    initials: "LI",
    action: "Cleared outstanding balance",
    detail: "₹1,20,000 settled",
    time: "1 hr ago",
  },
  {
    name: "Deepa Krishnan",
    initials: "DK",
    action: "Placed an advance booking",
    detail: "Custom necklace · Diwali order",
    time: "3 hr ago",
  },
  {
    name: "Suresh Patel",
    initials: "SP",
    action: "Requested a repair",
    detail: "Ring resizing · 18 g",
    time: "5 hr ago",
  },
]
