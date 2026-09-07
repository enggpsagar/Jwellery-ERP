// FILE PATH: prisma/seed-full-demo.ts
//
// One richly-populated demo store touching every major module (Customers,
// Vendors, Karigars, Products/Stock, Billing, Purchases, Quotations, Kacha
// slips, Draft Orders, Ledger, Payments In/Out, GST Rates, Metal Rates,
// Users) so it can be browsed end-to-end as Super Admin via the store
// switcher — mirrors the existing prisma/seed-*.ts scripts' own
// safe-to-re-run convention (delete-then-recreate everything scoped to this
// store's id, upsert the store/taxonomy/users by natural key), but in one
// single store rather than split across several demo stores.
//
// Run with: npm run db:seed:full-demo

import {
  PrismaClient,
  UserRole,
  UserStatus,
  PurityType,
  WeightUnit,
  InvoiceStatus,
  InventoryStockStatus,
  InventoryFinish,
  InventoryTransactionType,
  LedgerEntryType,
  LedgerSourceType,
  PaymentMethod,
  PartyGstType,
  GstScheme,
} from "@prisma/client";

const prisma = new PrismaClient();

const STORE_CODE = "DEMO-AURUM";
const STORE_NAME = "Aurum Demo Jewellers";

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(10, 0, 0, 0);
  return d;
}

function daysFromNow(days: number) {
  return daysAgo(-days);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// 0. Wipe anything from a previous run of this exact script, scoped strictly
//    to this store's own id — same convention as the other demo seeds.
// ---------------------------------------------------------------------------

async function resetStoreData(storeId: string) {
  await prisma.creditNoteItem.deleteMany({ where: { creditNote: { storeId } } });
  await prisma.creditNote.deleteMany({ where: { storeId } });
  await prisma.draftOrderItem.deleteMany({ where: { draftOrder: { storeId } } });
  await prisma.draftOrder.deleteMany({ where: { storeId } });
  await prisma.kachaInvoiceItem.deleteMany({ where: { kachaInvoice: { storeId } } });
  await prisma.kachaInvoice.deleteMany({ where: { storeId } });
  await prisma.invoiceItem.deleteMany({ where: { invoice: { storeId } } });
  await prisma.invoice.deleteMany({ where: { storeId } });
  await prisma.quotationItem.deleteMany({ where: { quotation: { storeId } } });
  await prisma.quotation.deleteMany({ where: { storeId } });
  await prisma.ledgerEntry.deleteMany({ where: { storeId } });
  await prisma.purchaseItem.deleteMany({ where: { purchase: { storeId } } });
  await prisma.purchase.deleteMany({ where: { storeId } });
  await prisma.karigarReceiptItem.deleteMany({ where: { karigarJob: { storeId } } });
  await prisma.karigarJob.deleteMany({ where: { storeId } });
  await prisma.inventoryTransaction.deleteMany({ where: { inventoryStock: { storeId } } });
  await prisma.inventoryStock.deleteMany({ where: { storeId } });
  await prisma.product.deleteMany({ where: { storeId } });
  await prisma.karigarMetal.deleteMany({ where: { karigar: { storeId } } });
  await prisma.karigar.deleteMany({ where: { storeId } });
  await prisma.customer.deleteMany({ where: { storeId } });
  await prisma.vendor.deleteMany({ where: { storeId } });
  await prisma.metalRate.deleteMany({ where: { storeId } });
  await prisma.gstRate.deleteMany({ where: { storeId } });
  await prisma.storeMetalOrigin.deleteMany({ where: { storeMetal: { storeId } } });
  await prisma.storeCategoryType.deleteMany({ where: { category: { storeId } } });
  await prisma.storeCategory.deleteMany({ where: { storeId } });
  await prisma.user.deleteMany({ where: { storeId } });

  // StoreMetal is referenced by Store.defaultLocationId's sibling
  // BusinessSettings.businessUnits (plain string ids, no FK) so it's safe to
  // clear last among taxonomy rows.
  await prisma.storeMetal.deleteMany({ where: { storeId } });
}

// ---------------------------------------------------------------------------
// 1. Store, locations, business settings
// ---------------------------------------------------------------------------

async function seedStoreShell() {
  const plan = await prisma.plan.findFirst({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  const store = await prisma.store.upsert({
    where: { code: STORE_CODE },
    update: {
      name: STORE_NAME,
      isActive: true,
      address: "14 Zaveri Bazaar",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400002",
      phone: "9820012345",
      email: "contact@aurumdemo.test",
      gstNumber: "27AURUM1234F1Z5",
      ...(plan
        ? {
            planId: plan.id,
            planStartedAt: daysAgo(20),
            planExpiresAt: daysFromNow(plan.durationDays - 20),
          }
        : {}),
    },
    create: {
      name: STORE_NAME,
      code: STORE_CODE,
      address: "14 Zaveri Bazaar",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400002",
      phone: "9820012345",
      email: "contact@aurumdemo.test",
      gstNumber: "27AURUM1234F1Z5",
      ...(plan
        ? {
            planId: plan.id,
            planStartedAt: daysAgo(20),
            planExpiresAt: daysFromNow(plan.durationDays - 20),
          }
        : {}),
    },
  });

  await resetStoreData(store.id);

  const mainShowroom = await prisma.storeLocation.upsert({
    where: { storeId_name: { storeId: store.id, name: "Main Showroom" } },
    update: {},
    create: { storeId: store.id, name: "Main Showroom", city: "Mumbai", state: "Maharashtra" },
  });
  const warehouse = await prisma.storeLocation.upsert({
    where: { storeId_name: { storeId: store.id, name: "City Warehouse" } },
    update: {},
    create: { storeId: store.id, name: "City Warehouse", city: "Mumbai", state: "Maharashtra" },
  });

  await prisma.store.update({
    where: { id: store.id },
    data: { defaultLocationId: mainShowroom.id },
  });

  return { store, mainShowroom, warehouse };
}

async function seedBusinessSettings(storeId: string, businessUnits: string[]) {
  await prisma.businessSettings.upsert({
    where: { storeId },
    update: {
      businessName: STORE_NAME,
      gstScheme: GstScheme.REGULAR_B2C,
      businessUnits,
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400002",
      gstNumber: "27AURUM1234F1Z5",
      stateCode: "27",
    },
    create: {
      storeId,
      businessName: STORE_NAME,
      gstScheme: GstScheme.REGULAR_B2C,
      businessUnits,
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400002",
      gstNumber: "27AURUM1234F1Z5",
      stateCode: "27",
    },
  });
}

// ---------------------------------------------------------------------------
// 2. Taxonomy — metals/stones, categories/types, GST rates, metal rates
// ---------------------------------------------------------------------------

async function seedTaxonomy(storeId: string) {
  const gold = await prisma.storeMetal.create({
    data: { storeId, name: "Gold", hasPurity: true, primaryUnit: WeightUnit.GRAM, sellingPrice: 6650 },
  });
  const silver = await prisma.storeMetal.create({
    data: { storeId, name: "Silver", hasPurity: true, primaryUnit: WeightUnit.GRAM, sellingPrice: 98 },
  });
  const diamond = await prisma.storeMetal.create({
    data: { storeId, name: "Diamond", isGemstone: true, primaryUnit: WeightUnit.CARAT, sellingPrice: 45000 },
  });

  const [natural, labGrown] = await Promise.all([
    prisma.storeMetalOrigin.create({ data: { storeId, storeMetalId: diamond.id, name: "Natural" } }),
    prisma.storeMetalOrigin.create({ data: { storeId, storeMetalId: diamond.id, name: "Lab-Grown" } }),
  ]);

  const ornament = await prisma.storeCategory.create({ data: { storeId, name: "Ornament" } });
  const coin = await prisma.storeCategory.create({ data: { storeId, name: "Coin" } });

  const ornamentTypeNames = ["Ring", "Necklace", "Chain", "Bangle", "Earring", "Mangalsutra", "Payal"];
  const ornamentTypes = new Map<string, string>();
  for (const name of ornamentTypeNames) {
    const type = await prisma.storeCategoryType.create({
      data: { storeId, categoryId: ornament.id, name },
    });
    ornamentTypes.set(name, type.id);
  }
  const coinType = await prisma.storeCategoryType.create({
    data: { storeId, categoryId: coin.id, name: "Coin" },
  });

  const [gst3, gst5, gst150] = await Promise.all([
    prisma.gstRate.create({ data: { storeId, name: "GST 3% (Standard)", ratePercent: 3, isDefault: true } }),
    prisma.gstRate.create({ data: { storeId, name: "GST 5% (Making Charges)", ratePercent: 5 } }),
    prisma.gstRate.create({ data: { storeId, name: "GST 1.5% (Small Stones)", ratePercent: 1.5 } }),
  ]);

  for (let i = 0; i < 3; i++) {
    await prisma.metalRate.create({
      data: {
        storeId,
        gold22k: 6620 + i * 15,
        gold24k: 7220 + i * 16,
        gold18k: 5410 + i * 12,
        gold14k: 4200 + i * 10,
        silver: 96 + i,
        platinum95: 3350 + i * 5,
        createdAt: daysAgo(4 - i * 2),
      },
    });
  }

  return {
    metals: { gold, silver, diamond },
    stoneTypes: { natural, labGrown },
    categories: { ornament, coin },
    categoryTypes: { ...Object.fromEntries(ornamentTypes), Coin: coinType.id },
    gstRates: { gst3, gst5, gst150 },
  };
}

// ---------------------------------------------------------------------------
// 3. Users
// ---------------------------------------------------------------------------

async function seedUsers(storeId: string) {
  await prisma.user.upsert({
    where: { email: "admin@aurumdemo.test" },
    update: { name: "Aarav Mehta", role: UserRole.ADMIN, status: UserStatus.ACTIVE, isActive: true, storeId, emailVerified: new Date() },
    create: {
      name: "Aarav Mehta",
      email: "admin@aurumdemo.test",
      phone: "9811100001",
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      isActive: true,
      storeId,
      emailVerified: new Date(),
    },
  });

  await prisma.user.upsert({
    where: { email: "staff.priya@aurumdemo.test" },
    update: { name: "Priya Nair", role: UserRole.STAFF, status: UserStatus.ACTIVE, isActive: true, storeId, emailVerified: new Date() },
    create: {
      name: "Priya Nair",
      email: "staff.priya@aurumdemo.test",
      phone: "9811100002",
      role: UserRole.STAFF,
      status: UserStatus.ACTIVE,
      isActive: true,
      storeId,
      emailVerified: new Date(),
    },
  });

  await prisma.user.upsert({
    where: { email: "staff.rohan@aurumdemo.test" },
    update: { name: "Rohan Deshmukh", role: UserRole.STAFF, status: UserStatus.INVITED, isActive: true, storeId },
    create: {
      name: "Rohan Deshmukh",
      email: "staff.rohan@aurumdemo.test",
      phone: "9811100003",
      role: UserRole.STAFF,
      status: UserStatus.INVITED,
      isActive: true,
      storeId,
    },
  });

  await prisma.user.upsert({
    where: { email: "staff.karan@aurumdemo.test" },
    update: { name: "Karan Oberoi", role: UserRole.STAFF, status: UserStatus.DISABLED, isActive: false, storeId },
    create: {
      name: "Karan Oberoi",
      email: "staff.karan@aurumdemo.test",
      phone: "9811100004",
      role: UserRole.STAFF,
      status: UserStatus.DISABLED,
      isActive: false,
      storeId,
    },
  });
}

// ---------------------------------------------------------------------------
// 4. Customers, Vendors, Karigars
// ---------------------------------------------------------------------------

async function seedCustomers(storeId: string) {
  const rows = [
    { name: "Ananya Kulkarni", phone: "9000010001", city: "Mumbai", state: "Maharashtra", pincode: "400001", openingBalance: 5000, gstType: PartyGstType.UNREGISTERED },
    { name: "Vivaan Shah", phone: "9000010002", city: "Pune", state: "Maharashtra", pincode: "411001", openingBalance: 0, gstType: PartyGstType.UNREGISTERED },
    { name: "Ishita Rao", phone: "9000010003", city: "Ahmedabad", state: "Gujarat", pincode: "380001", openingBalance: 12000, gstType: PartyGstType.REGULAR, gstin: "24ISHITA123F1Z1" },
    { name: "Kabir Malhotra", phone: "9000010004", city: "Delhi", state: "Delhi", pincode: "110001", openingBalance: 0, gstType: PartyGstType.UNREGISTERED },
    { name: "Sanya Bhatt", phone: "9000010005", city: "Jaipur", state: "Rajasthan", pincode: "302001", openingBalance: 3200, gstType: PartyGstType.UNREGISTERED },
    { name: "Devansh Chawla", phone: "9000010006", city: "Chennai", state: "Tamil Nadu", pincode: "600001", openingBalance: 0, gstType: PartyGstType.UNREGISTERED },
  ];

  const customers = [];
  for (const row of rows) {
    customers.push(await prisma.customer.create({ data: { storeId, ...row } }));
  }
  return customers;
}

async function seedVendors(storeId: string) {
  const rows = [
    { name: "Chandra Bullion Suppliers", phone: "9100020001", city: "Mumbai", state: "Maharashtra", gstType: PartyGstType.REGULAR, gstin: "27CHANDRA123F1Z1", openingBalance: 45000 },
    { name: "Suraj Diamond House", phone: "9100020002", city: "Surat", state: "Gujarat", gstType: PartyGstType.REGULAR, gstin: "24SURAJ456G1Z2", openingBalance: 0 },
    { name: "Local Silver Traders", phone: "9100020003", city: "Mumbai", state: "Maharashtra", gstType: PartyGstType.UNREGISTERED, openingBalance: 0 },
    { name: "Retired Gold Refiners", phone: "9100020004", city: "Pune", state: "Maharashtra", gstType: PartyGstType.COMPOSITION, gstin: "27RETIRE789H1Z3", openingBalance: 0, isArchived: true, isActive: false },
  ];

  const vendors = [];
  for (const row of rows) {
    vendors.push(await prisma.vendor.create({ data: { storeId, ...row } }));
  }
  return vendors;
}

async function seedKarigars(storeId: string, metals: { gold: { id: string }; silver: { id: string }; diamond: { id: string } }, locationId: string) {
  const ramesh = await prisma.karigar.create({
    data: { storeId, code: "AUR-K001", name: "Ramesh Sonar", mobile: "9200030001", city: "Mumbai", specialization: "Ring & Bangle making", openingGold: 12.5, openingCash: 0, metalTypeId: metals.gold.id, locationId },
  });
  const ganesh = await prisma.karigar.create({
    data: { storeId, code: "AUR-K002", name: "Ganesh Patil", mobile: "9200030002", city: "Pune", specialization: "Necklace & Chain", openingGold: 0, openingCash: 5000, metalTypeId: metals.gold.id },
  });
  const iqbal = await prisma.karigar.create({
    data: { storeId, code: "AUR-K003", name: "Iqbal Ansari", mobile: "9200030003", city: "Surat", specialization: "Stone setting", openingGold: 3.2, openingCash: 0, metalTypeId: metals.diamond.id },
  });
  const meera = await prisma.karigar.create({
    data: { storeId, code: "AUR-K004", name: "Meera Joshi", mobile: "9200030004", city: "Mumbai", specialization: "Silver utensils (on leave)", openingGold: 0, openingCash: 0, metalTypeId: metals.silver.id, isActive: false },
  });

  await prisma.karigarMetal.createMany({
    data: [
      { karigarId: ramesh.id, metalTypeId: metals.gold.id },
      { karigarId: ramesh.id, metalTypeId: metals.silver.id },
      { karigarId: ganesh.id, metalTypeId: metals.gold.id },
      { karigarId: iqbal.id, metalTypeId: metals.diamond.id },
      { karigarId: iqbal.id, metalTypeId: metals.gold.id },
      { karigarId: meera.id, metalTypeId: metals.silver.id },
    ],
  });

  return { ramesh, ganesh, iqbal, meera };
}

// ---------------------------------------------------------------------------
// 5. Products + Inventory Stock
// ---------------------------------------------------------------------------

type ProductSeed = {
  code: string;
  name: string;
  categoryTypeName: string;
  metalKey: "gold" | "silver" | "diamond";
  purity?: PurityType;
  stock: {
    stockCode: string;
    quantity?: number;
    grossWeight?: number;
    netWeight?: number;
    caratWeight?: number;
    purchaseRate: number;
    saleRate: number;
    makingCharge?: number;
    status?: InventoryStockStatus;
  }[];
};

async function seedProductsAndStock(
  storeId: string,
  categories: { ornament: { id: string }; coin: { id: string } },
  categoryTypes: Record<string, string>,
  metals: { gold: { id: string }; silver: { id: string }; diamond: { id: string } },
  locations: { mainShowroom: { id: string }; warehouse: { id: string } },
) {
  const metalId = (key: ProductSeed["metalKey"]) => metals[key].id;
  const categoryId = (typeName: string) => (typeName === "Coin" ? categories.coin.id : categories.ornament.id);

  const seeds: ProductSeed[] = [
    {
      code: "PRD-RING-001",
      name: "Classic Gold Ring",
      categoryTypeName: "Ring",
      metalKey: "gold",
      purity: PurityType.GOLD_22K,
      stock: [
        { stockCode: "STK-AUR-001", grossWeight: 5.2, netWeight: 5.0, purchaseRate: 6100, saleRate: 6450, makingCharge: 900 },
        { stockCode: "STK-AUR-002", grossWeight: 6.1, netWeight: 5.85, purchaseRate: 6100, saleRate: 6450, makingCharge: 1100 },
      ],
    },
    {
      code: "PRD-NECK-001",
      name: "Lakshmi Necklace Set",
      categoryTypeName: "Necklace",
      metalKey: "gold",
      purity: PurityType.GOLD_22K,
      stock: [{ stockCode: "STK-AUR-003", grossWeight: 38.5, netWeight: 36.9, purchaseRate: 6100, saleRate: 6480, makingCharge: 5200 }],
    },
    {
      code: "PRD-CHAIN-001",
      name: "Machine Gold Chain",
      categoryTypeName: "Chain",
      metalKey: "gold",
      purity: PurityType.GOLD_22K,
      stock: [
        { stockCode: "STK-AUR-004", grossWeight: 14.25, netWeight: 13.9, purchaseRate: 6100, saleRate: 6425, makingCharge: 1700 },
        { stockCode: "STK-AUR-005", grossWeight: 9.6, netWeight: 9.3, purchaseRate: 6100, saleRate: 6425, makingCharge: 1200, status: InventoryStockStatus.SOLD },
      ],
    },
    {
      code: "PRD-BANGLE-001",
      name: "Plain Gold Bangle Pair",
      categoryTypeName: "Bangle",
      metalKey: "gold",
      purity: PurityType.GOLD_22K,
      stock: [{ stockCode: "STK-AUR-006", quantity: 2, grossWeight: 24.6, netWeight: 24.0, purchaseRate: 6100, saleRate: 6450, makingCharge: 2600 }],
    },
    {
      code: "PRD-PAYAL-001",
      name: "Silver Payal Pair",
      categoryTypeName: "Payal",
      metalKey: "silver",
      purity: PurityType.SILVER_925,
      stock: [{ stockCode: "STK-AUR-007", quantity: 2, grossWeight: 52.5, netWeight: 51.3, purchaseRate: 82, saleRate: 95, makingCharge: 650 }],
    },
    {
      code: "PRD-EAR-001",
      name: "Gold Stud Earrings",
      categoryTypeName: "Earring",
      metalKey: "gold",
      purity: PurityType.GOLD_22K,
      stock: [{ stockCode: "STK-AUR-008", grossWeight: 3.85, netWeight: 3.7, purchaseRate: 6100, saleRate: 6450, makingCharge: 850, status: InventoryStockStatus.SOLD }],
    },
    {
      code: "PRD-MANG-001",
      name: "Mangalsutra Black Bead",
      categoryTypeName: "Mangalsutra",
      metalKey: "gold",
      purity: PurityType.GOLD_22K,
      stock: [{ stockCode: "STK-AUR-009", grossWeight: 19.3, netWeight: 18.7, purchaseRate: 6100, saleRate: 6460, makingCharge: 3200 }],
    },
    {
      code: "PRD-GCOIN-001",
      name: "Gold Coin 10gm",
      categoryTypeName: "Coin",
      metalKey: "gold",
      purity: PurityType.GOLD_24K,
      stock: [{ stockCode: "STK-AUR-010", grossWeight: 10.0, netWeight: 10.0, purchaseRate: 7050, saleRate: 7250 }],
    },
    {
      code: "PRD-SCOIN-001",
      name: "Silver Coin 20gm",
      categoryTypeName: "Coin",
      metalKey: "silver",
      purity: PurityType.SILVER_999,
      stock: [{ stockCode: "STK-AUR-011", grossWeight: 20.0, netWeight: 20.0, purchaseRate: 88, saleRate: 105 }],
    },
    {
      code: "PRD-DRING-001",
      name: "Diamond Solitaire Ring",
      categoryTypeName: "Ring",
      metalKey: "diamond",
      purity: PurityType.DIAMOND,
      stock: [{ stockCode: "STK-AUR-012", caratWeight: 1.2, purchaseRate: 42000, saleRate: 46000, makingCharge: 8000 }],
    },
  ];

  const products: { id: string; name: string }[] = [];
  const stockByCode = new Map<string, { id: string; saleRate: number; product: { id: string; name: string } }>();

  for (const [index, seed] of seeds.entries()) {
    const product = await prisma.product.create({
      data: {
        storeId,
        productCode: seed.code,
        name: seed.name,
        categoryId: categoryId(seed.categoryTypeName),
        categoryTypeId: categoryTypes[seed.categoryTypeName],
        metalTypeId: metalId(seed.metalKey),
        defaultPurity: seed.purity,
        defaultMakingCharge: seed.stock[0]?.makingCharge ?? 0,
      },
    });
    products.push(product);

    for (const [stockIndex, stock] of seed.stock.entries()) {
      const created = await prisma.inventoryStock.create({
        data: {
          storeId,
          productId: product.id,
          stockCode: stock.stockCode,
          metalTypeId: metalId(seed.metalKey),
          purity: seed.purity,
          quantity: stock.quantity ?? 1,
          status: stock.status ?? InventoryStockStatus.IN_STOCK,
          finish: index % 2 === 0 ? InventoryFinish.PAKKA : InventoryFinish.KACHA,
          grossWeight: stock.grossWeight,
          netWeight: stock.netWeight,
          caratWeight: stock.caratWeight,
          purchaseRate: stock.purchaseRate,
          saleRate: stock.saleRate,
          makingCharge: stock.makingCharge ?? 0,
          purchaseAmount: (stock.netWeight ?? stock.caratWeight ?? 0) * stock.purchaseRate,
          saleAmount: (stock.netWeight ?? stock.caratWeight ?? 0) * stock.saleRate + (stock.makingCharge ?? 0),
          locationId: stockIndex % 2 === 0 ? locations.mainShowroom.id : locations.warehouse.id,
          purchaseDate: daysAgo(60 - index * 3),
        },
      });

      await prisma.inventoryTransaction.create({
        data: {
          inventoryStockId: created.id,
          transactionType: InventoryTransactionType.OPENING,
          quantity: stock.quantity ?? 1,
          grossWeight: stock.grossWeight,
          netWeight: stock.netWeight,
          referenceType: "Seed",
          notes: "Opening stock (demo seed)",
        },
      });

      stockByCode.set(stock.stockCode, { id: created.id, saleRate: stock.saleRate, product });
    }
  }

  return { products, stockByCode };
}

// ---------------------------------------------------------------------------
// 6. Invoices (per-line GST rate, stock-linked + manual lines, one carat line)
// ---------------------------------------------------------------------------

async function seedInvoices(
  storeId: string,
  customers: { id: string; name: string }[],
  stockByCode: Map<string, { id: string; saleRate: number; product: { id: string; name: string } }>,
  metals: { gold: { id: string }; diamond: { id: string } },
  gstRates: { gst3: { id: string; name: string; ratePercent: unknown }; gst5: { id: string; name: string; ratePercent: unknown } },
  location: { id: string },
) {
  const invoices: { id: string; invoiceNumber: string }[] = [];

  type ItemPlan = {
    itemName: string;
    metalTypeId?: string;
    purity?: PurityType;
    netWeight?: number;
    caratWeight?: number;
    rate: number;
    makingCharge?: number;
    gstRateId?: string;
    gstRateName?: string;
    gstRatePercent?: number;
    inventoryStockId?: string;
  };

  const plans: {
    customer: { id: string; name: string };
    daysAgo: number;
    status: InvoiceStatus;
    paidRatio: number;
    items: ItemPlan[];
  }[] = [
    {
      customer: customers[0],
      daysAgo: 18,
      status: InvoiceStatus.PAID,
      paidRatio: 1,
      items: [
        (() => {
          const s = stockByCode.get("STK-AUR-001")!;
          return {
            itemName: s.product.name,
            metalTypeId: metals.gold.id,
            purity: PurityType.GOLD_22K,
            netWeight: 5.0,
            rate: s.saleRate,
            makingCharge: 900,
            gstRateId: gstRates.gst3.id,
            gstRateName: gstRates.gst3.name,
            gstRatePercent: 3,
            inventoryStockId: s.id,
          };
        })(),
      ],
    },
    {
      customer: customers[1],
      daysAgo: 15,
      status: InvoiceStatus.PARTIAL,
      paidRatio: 0.5,
      items: [
        (() => {
          const s = stockByCode.get("STK-AUR-003")!;
          return {
            itemName: s.product.name,
            metalTypeId: metals.gold.id,
            purity: PurityType.GOLD_22K,
            netWeight: 36.9,
            rate: s.saleRate,
            makingCharge: 5200,
            gstRateId: gstRates.gst3.id,
            gstRateName: gstRates.gst3.name,
            gstRatePercent: 3,
            inventoryStockId: s.id,
          };
        })(),
      ],
    },
    {
      customer: customers[2],
      daysAgo: 11,
      status: InvoiceStatus.PAID,
      paidRatio: 1,
      items: [
        {
          itemName: "Custom Gold Pendant (manual entry)",
          metalTypeId: metals.gold.id,
          purity: PurityType.GOLD_22K,
          netWeight: 7.4,
          rate: 6460,
          makingCharge: 1400,
          gstRateId: gstRates.gst5.id,
          gstRateName: gstRates.gst5.name,
          gstRatePercent: 5,
        },
      ],
    },
    {
      customer: customers[3],
      daysAgo: 8,
      status: InvoiceStatus.DRAFT,
      paidRatio: 0,
      items: [
        (() => {
          const s = stockByCode.get("STK-AUR-009")!;
          return {
            itemName: s.product.name,
            metalTypeId: metals.gold.id,
            purity: PurityType.GOLD_22K,
            netWeight: 18.7,
            rate: s.saleRate,
            makingCharge: 3200,
            gstRateId: gstRates.gst3.id,
            gstRateName: gstRates.gst3.name,
            gstRatePercent: 3,
            inventoryStockId: s.id,
          };
        })(),
      ],
    },
    {
      customer: customers[4],
      daysAgo: 5,
      status: InvoiceStatus.PARTIAL,
      paidRatio: 0.4,
      items: [
        (() => {
          const s = stockByCode.get("STK-AUR-012")!;
          return {
            itemName: s.product.name,
            metalTypeId: metals.diamond.id,
            purity: PurityType.DIAMOND,
            caratWeight: 1.2,
            rate: s.saleRate,
            makingCharge: 8000,
            gstRateId: gstRates.gst3.id,
            gstRateName: gstRates.gst3.name,
            gstRatePercent: 3,
            inventoryStockId: s.id,
          };
        })(),
      ],
    },
    {
      customer: customers[0],
      daysAgo: 3,
      status: InvoiceStatus.PAID,
      paidRatio: 1,
      items: [
        {
          itemName: "Gold + Making (mixed GST lines, no stock link)",
          metalTypeId: metals.gold.id,
          purity: PurityType.GOLD_22K,
          netWeight: 4.2,
          rate: 6470,
          makingCharge: 0,
          gstRateId: gstRates.gst3.id,
          gstRateName: gstRates.gst3.name,
          gstRatePercent: 3,
        },
      ],
    },
    {
      // Deliberately plain — no GST rate at all, to exercise the invoices
      // list alongside GST-rated ones (an older-style / Composition-scheme
      // style row, matching the legacy nullable-gstRateId convention).
      customer: customers[5],
      daysAgo: 1,
      status: InvoiceStatus.PAID,
      paidRatio: 1,
      items: [
        {
          itemName: "Silver Coin 20gm",
          rate: 105,
          netWeight: 20,
        },
      ],
    },
  ];

  let counter = 1;
  for (const plan of plans) {
    const invoiceNumber = `AUR-INV-${String(counter).padStart(4, "0")}`;
    counter += 1;

    const subtotal = plan.items.reduce((sum, item) => sum + (item.netWeight ?? item.caratWeight ?? 0) * item.rate, 0);
    const makingCharges = plan.items.reduce((sum, item) => sum + (item.makingCharge ?? 0), 0);
    const itemTax = plan.items.map((item) => {
      const lineBase = (item.netWeight ?? item.caratWeight ?? 0) * item.rate + (item.makingCharge ?? 0);
      const gstAmount = item.gstRatePercent ? round2((lineBase * item.gstRatePercent) / 100) : 0;
      return { lineBase, gstAmount };
    });
    const taxAmount = round2(itemTax.reduce((sum, t) => sum + t.gstAmount, 0));
    const totalAmount = round2(subtotal + makingCharges + taxAmount);
    const paidAmount = round2(totalAmount * plan.paidRatio);
    const balanceAmount = round2(totalAmount - paidAmount);
    const invoiceDate = daysAgo(plan.daysAgo);

    const invoice = await prisma.invoice.create({
      data: {
        storeId,
        invoiceNumber,
        customerId: plan.customer.id,
        invoiceDate,
        status: plan.status,
        subtotal: round2(subtotal),
        makingCharges: round2(makingCharges),
        taxAmount,
        totalAmount,
        paidAmount,
        balanceAmount,
        locationId: location.id,
        createdByName: "Priya Nair",
        gstRateId: plan.items[0]?.gstRateId,
        gstRateName: plan.items[0]?.gstRateName,
        gstRatePercent: plan.items[0]?.gstRatePercent,
        items: {
          create: plan.items.map((item, i) => ({
            itemName: item.itemName,
            metalTypeId: item.metalTypeId,
            purity: item.purity,
            quantity: 1,
            netWeight: item.netWeight,
            caratWeight: item.caratWeight,
            rate: item.rate,
            makingCharge: item.makingCharge ?? 0,
            sgstAmount: round2(itemTax[i].gstAmount / 2),
            cgstAmount: round2(itemTax[i].gstAmount / 2),
            gstRateId: item.gstRateId,
            gstRateName: item.gstRateName,
            gstRatePercent: item.gstRatePercent,
            lineTotal: round2(itemTax[i].lineBase + itemTax[i].gstAmount),
            inventoryStockId: item.inventoryStockId,
          })),
        },
      },
    });

    for (const item of plan.items) {
      if (!item.inventoryStockId) continue;
      await prisma.inventoryStock.update({
        where: { id: item.inventoryStockId },
        data: { status: InventoryStockStatus.SOLD, quantity: 0, saleAmount: totalAmount },
      });
      await prisma.inventoryTransaction.create({
        data: {
          inventoryStockId: item.inventoryStockId,
          transactionType: InventoryTransactionType.SALE,
          netWeight: item.netWeight,
          referenceType: "Invoice",
          referenceId: invoice.id,
        },
      });
    }

    await prisma.ledgerEntry.create({
      data: {
        storeId,
        entryDate: invoiceDate,
        type: LedgerEntryType.DEBIT,
        sourceType: LedgerSourceType.SALE,
        customerId: plan.customer.id,
        invoiceId: invoice.id,
        amount: totalAmount,
        locationId: location.id,
        description: `Sale via ${invoiceNumber}`,
      },
    });

    if (paidAmount > 0) {
      await prisma.ledgerEntry.create({
        data: {
          storeId,
          entryDate: invoiceDate,
          type: LedgerEntryType.CREDIT,
          sourceType: LedgerSourceType.SALE,
          customerId: plan.customer.id,
          invoiceId: invoice.id,
          amount: paidAmount,
          locationId: location.id,
          description: `Payment received against ${invoiceNumber}`,
        },
      });
    }

    invoices.push({ id: invoice.id, invoiceNumber });
  }

  return invoices;
}

// ---------------------------------------------------------------------------
// 7. Credit note (return) against the first PAID invoice's manual line
// ---------------------------------------------------------------------------

async function seedCreditNote(storeId: string, invoiceId: string, customerId: string) {
  const item = await prisma.invoiceItem.findFirst({ where: { invoiceId } });
  if (!item) return;

  const creditNote = await prisma.creditNote.create({
    data: {
      storeId,
      creditNoteNumber: "AUR-CN-0001",
      invoiceId,
      customerId,
      creditNoteDate: daysAgo(10),
      reason: "Customer returned for resize",
      totalAmount: Number(item.lineTotal),
      createdByName: "Priya Nair",
      items: {
        create: [
          {
            invoiceItemId: item.id,
            itemName: item.itemName,
            quantity: 1,
            rate: item.rate ?? undefined,
            lineTotal: item.lineTotal,
          },
        ],
      },
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      storeId,
      entryDate: daysAgo(10),
      type: LedgerEntryType.CREDIT,
      sourceType: LedgerSourceType.SALE_RETURN,
      customerId,
      creditNoteId: creditNote.id,
      amount: Number(item.lineTotal),
      description: `Return against credit note ${creditNote.creditNoteNumber}`,
    },
  });
}

// ---------------------------------------------------------------------------
// 8. Quotations (open / expired / converted)
// ---------------------------------------------------------------------------

async function seedQuotations(
  storeId: string,
  customers: { id: string; name: string }[],
  gstRate: { id: string; name: string },
  location: { id: string },
) {
  const openQuotation = await prisma.quotation.create({
    data: {
      storeId,
      quotationNumber: "AUR-QUO-0001",
      customerId: customers[1].id,
      quotationDate: daysAgo(6),
      validUntil: daysFromNow(24),
      status: "open",
      subtotal: 245700,
      makingCharges: 4500,
      totalAmount: 250200,
      gstRateId: gstRate.id,
      gstRateName: gstRate.name,
      gstRatePercent: 3,
      locationId: location.id,
      items: {
        create: [
          {
            itemName: "Gold Necklace (quote)",
            netWeight: 38,
            rate: 6460,
            makingCharge: 4500,
            lineTotal: 250200,
          },
        ],
      },
    },
  });

  await prisma.quotation.create({
    data: {
      storeId,
      quotationNumber: "AUR-QUO-0002",
      customerId: customers[3].id,
      quotationDate: daysAgo(45),
      validUntil: daysAgo(15),
      status: "expired",
      subtotal: 64500,
      makingCharges: 900,
      totalAmount: 65400,
      locationId: location.id,
      items: {
        create: [
          { itemName: "Gold Ring (quote, expired)", netWeight: 10, rate: 6450, makingCharge: 900, lineTotal: 65400 },
        ],
      },
    },
  });

  await prisma.quotation.create({
    data: {
      storeId,
      quotationNumber: "AUR-QUO-0003",
      customerId: customers[4].id,
      quotationDate: daysAgo(2),
      validUntil: daysFromNow(28),
      status: "open",
      subtotal: 9800,
      makingCharges: 650,
      totalAmount: 10450,
      locationId: location.id,
      items: {
        create: [
          { itemName: "Silver Payal (quote)", netWeight: 100, rate: 98, makingCharge: 650, lineTotal: 10450 },
        ],
      },
    },
  });

  return { openQuotation };
}

// ---------------------------------------------------------------------------
// 9. Kacha slips (one converted to a Pakka invoice)
// ---------------------------------------------------------------------------

async function seedKachaSlips(
  storeId: string,
  customers: { id: string; name: string }[],
  stockByCode: Map<string, { id: string; saleRate: number; product: { id: string; name: string } }>,
  location: { id: string },
) {
  const stock = stockByCode.get("STK-AUR-007")!; // Silver Payal Pair — still IN_STOCK

  const netWeight = 51.3;
  const rate = 95;
  const makingCharge = 650;
  const total = netWeight * rate + makingCharge;

  const kacha = await prisma.kachaInvoice.create({
    data: {
      storeId,
      slipNumber: "AUR-KACHA-0001",
      customerId: customers[2].id,
      invoiceDate: daysAgo(7),
      status: InvoiceStatus.PAID,
      subtotal: netWeight * rate,
      makingCharges: makingCharge,
      totalAmount: total,
      paidAmount: total,
      locationId: location.id,
      items: {
        create: [
          {
            itemName: stock.product.name,
            quantity: 1,
            netWeight,
            rate,
            makingCharge,
            lineTotal: total,
            inventoryStockId: stock.id,
          },
        ],
      },
    },
  });

  await prisma.inventoryStock.update({
    where: { id: stock.id },
    data: { status: InventoryStockStatus.SOLD, quantity: 0, saleAmount: total },
  });

  const invoiceNumber = "AUR-INV-CONV-0001";
  const pakkaInvoice = await prisma.invoice.create({
    data: {
      storeId,
      invoiceNumber,
      customerId: customers[2].id,
      invoiceDate: daysAgo(7),
      status: InvoiceStatus.PAID,
      subtotal: netWeight * rate,
      makingCharges: makingCharge,
      totalAmount: total,
      paidAmount: total,
      locationId: location.id,
      notes: `Converted from Kacha slip ${kacha.slipNumber}`,
      items: {
        create: [
          {
            itemName: stock.product.name,
            quantity: 1,
            netWeight,
            rate,
            makingCharge,
            lineTotal: total,
            inventoryStockId: stock.id,
          },
        ],
      },
    },
  });

  await prisma.kachaInvoice.update({ where: { id: kacha.id }, data: { convertedToId: pakkaInvoice.id } });

  // A second, still-open Kacha slip (not converted) so /billing/kacha shows
  // both a converted and a pending slip.
  const netWeight2 = 20;
  const rate2 = 105;
  const total2 = netWeight2 * rate2;
  await prisma.kachaInvoice.create({
    data: {
      storeId,
      slipNumber: "AUR-KACHA-0002",
      customerId: customers[5].id,
      invoiceDate: daysAgo(2),
      status: InvoiceStatus.PARTIAL,
      subtotal: total2,
      totalAmount: total2,
      paidAmount: round2(total2 * 0.5),
      balanceAmount: round2(total2 * 0.5),
      locationId: location.id,
      items: {
        create: [{ itemName: "Silver Coin 20gm (kacha)", quantity: 1, netWeight: netWeight2, rate: rate2, lineTotal: total2 }],
      },
    },
  });
}

// ---------------------------------------------------------------------------
// 10. Purchases (restocking from vendors)
// ---------------------------------------------------------------------------

async function seedPurchases(
  storeId: string,
  vendors: { id: string; name: string }[],
  products: { id: string; name: string }[],
  metals: { gold: { id: string }; silver: { id: string } },
  gstRates: { gst3: { id: string; name: string } },
  location: { id: string },
) {
  const ringProduct = products.find((p) => p.name === "Classic Gold Ring")!;
  const coinProduct = products.find((p) => p.name === "Gold Coin 10gm")!;
  const payalProduct = products.find((p) => p.name === "Silver Payal Pair")!;

  const plans = [
    {
      vendor: vendors[0],
      product: ringProduct,
      metalTypeId: metals.gold.id,
      purity: PurityType.GOLD_22K,
      stockCode: "STK-AUR-PUR-001",
      netWeight: 12,
      rate: 6100,
      makingCharge: 0,
      daysAgo: 30,
      status: InvoiceStatus.PAID,
      gstRateId: gstRates.gst3.id,
      gstRateName: gstRates.gst3.name,
    },
    {
      vendor: vendors[1],
      product: coinProduct,
      metalTypeId: metals.gold.id,
      purity: PurityType.GOLD_24K,
      stockCode: "STK-AUR-PUR-002",
      netWeight: 50,
      rate: 7050,
      makingCharge: 0,
      daysAgo: 40,
      status: InvoiceStatus.PARTIAL,
      gstRateId: gstRates.gst3.id,
      gstRateName: gstRates.gst3.name,
    },
    {
      vendor: vendors[2],
      product: payalProduct,
      metalTypeId: metals.silver.id,
      purity: PurityType.SILVER_925,
      stockCode: "STK-AUR-PUR-003",
      netWeight: 200,
      rate: 82,
      makingCharge: 0,
      daysAgo: 50,
      status: InvoiceStatus.DRAFT,
      gstRateId: undefined,
      gstRateName: undefined,
    },
  ];

  let counter = 1;
  for (const plan of plans) {
    const purchaseNumber = `AUR-PUR-${String(counter).padStart(4, "0")}`;
    counter += 1;

    const purchaseDate = daysAgo(plan.daysAgo);
    const lineTotal = plan.netWeight * plan.rate + plan.makingCharge;
    const gstRatePercent = plan.gstRateId ? 3 : undefined;
    const taxAmount = gstRatePercent ? round2((lineTotal * gstRatePercent) / 100) : 0;
    const totalAmount = round2(lineTotal + taxAmount);
    const paidAmount =
      plan.status === InvoiceStatus.PAID ? totalAmount : plan.status === InvoiceStatus.PARTIAL ? round2(totalAmount * 0.5) : 0;
    const balanceAmount = round2(totalAmount - paidAmount);

    const stock = await prisma.inventoryStock.create({
      data: {
        storeId,
        productId: plan.product.id,
        stockCode: plan.stockCode,
        metalTypeId: plan.metalTypeId,
        purity: plan.purity,
        quantity: 1,
        status: InventoryStockStatus.IN_STOCK,
        finish: InventoryFinish.PAKKA,
        netWeight: plan.netWeight,
        grossWeight: plan.netWeight,
        purchaseRate: plan.rate,
        purchaseAmount: lineTotal,
        vendorId: plan.vendor.id,
        vendorName: plan.vendor.name,
        purchaseDate,
        locationId: location.id,
      },
    });

    const purchase = await prisma.purchase.create({
      data: {
        storeId,
        purchaseNumber,
        vendorId: plan.vendor.id,
        purchaseDate,
        status: plan.status,
        subtotal: lineTotal,
        taxAmount,
        totalAmount,
        paidAmount,
        balanceAmount,
        gstRateId: plan.gstRateId,
        gstRateName: plan.gstRateName,
        gstRatePercent,
        locationId: location.id,
        createdByName: "Aarav Mehta",
        items: {
          create: [
            {
              productId: plan.product.id,
              itemName: plan.product.name,
              metalTypeId: plan.metalTypeId,
              purity: plan.purity,
              quantity: 1,
              netWeight: plan.netWeight,
              rate: plan.rate,
              lineTotal,
              inventoryStockId: stock.id,
            },
          ],
        },
      },
    });

    await prisma.inventoryTransaction.create({
      data: {
        inventoryStockId: stock.id,
        transactionType: InventoryTransactionType.PURCHASE,
        netWeight: plan.netWeight,
        referenceType: "Purchase",
        referenceId: purchase.id,
      },
    });

    if (balanceAmount > 0) {
      await prisma.ledgerEntry.create({
        data: {
          storeId,
          entryDate: purchaseDate,
          type: LedgerEntryType.CREDIT,
          sourceType: LedgerSourceType.PURCHASE,
          vendorId: plan.vendor.id,
          purchaseId: purchase.id,
          amount: balanceAmount,
          locationId: location.id,
          description: `Purchase ${purchaseNumber} balance due`,
        },
      });
    }

    if (paidAmount > 0) {
      await prisma.ledgerEntry.create({
        data: {
          storeId,
          entryDate: purchaseDate,
          type: LedgerEntryType.DEBIT,
          sourceType: LedgerSourceType.PAYMENT_OUT,
          vendorId: plan.vendor.id,
          purchaseId: purchase.id,
          amount: paidAmount,
          paymentMethod: PaymentMethod.NET_BANKING,
          locationId: location.id,
          description: `Payment made for ${purchaseNumber}`,
        },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 11. Karigar jobs (material issue/receipt) + Draft Orders
// ---------------------------------------------------------------------------

async function seedKarigarJobsAndDraftOrders(
  storeId: string,
  karigars: { ramesh: { id: string }; ganesh: { id: string }; iqbal: { id: string } },
  metals: { gold: { id: string }; diamond: { id: string } },
  customers: { id: string; name: string }[],
  location: { id: string },
) {
  const issueDate1 = daysAgo(14);
  await prisma.karigarJob.create({
    data: {
      storeId,
      jobNumber: "AUR-JOB-0001",
      karigarId: karigars.ramesh.id,
      issueDate: issueDate1,
      receivedDate: daysAgo(3),
      metalTypeId: metals.gold.id,
      issueWeight: 25,
      receiveWeight: 24.2,
      labourCharge: 3500,
      status: "received",
      locationId: location.id,
    },
  });
  await prisma.ledgerEntry.create({
    data: {
      storeId,
      entryDate: issueDate1,
      type: LedgerEntryType.DEBIT,
      sourceType: LedgerSourceType.KARIGAR_ISSUE,
      karigarId: karigars.ramesh.id,
      metalTypeId: metals.gold.id,
      metalWeight: 25,
      amount: 3500,
      locationId: location.id,
      description: "Material issued for AUR-JOB-0001",
    },
  });
  await prisma.ledgerEntry.create({
    data: {
      storeId,
      entryDate: daysAgo(3),
      type: LedgerEntryType.CREDIT,
      sourceType: LedgerSourceType.KARIGAR_RECEIPT,
      karigarId: karigars.ramesh.id,
      metalTypeId: metals.gold.id,
      metalWeight: 24.2,
      amount: 0,
      locationId: location.id,
      description: "Finished goods received for AUR-JOB-0001",
    },
  });

  const issueDate2 = daysAgo(6);
  await prisma.karigarJob.create({
    data: {
      storeId,
      jobNumber: "AUR-JOB-0002",
      karigarId: karigars.ganesh.id,
      issueDate: issueDate2,
      metalTypeId: metals.gold.id,
      issueWeight: 40,
      labourCharge: 6200,
      status: "issued",
      locationId: location.id,
    },
  });
  await prisma.ledgerEntry.create({
    data: {
      storeId,
      entryDate: issueDate2,
      type: LedgerEntryType.DEBIT,
      sourceType: LedgerSourceType.KARIGAR_ISSUE,
      karigarId: karigars.ganesh.id,
      metalTypeId: metals.gold.id,
      metalWeight: 40,
      amount: 6200,
      locationId: location.id,
      description: "Material issued for AUR-JOB-0002",
    },
  });

  // Draft order 1 — just created, no karigar job yet.
  await prisma.draftOrder.create({
    data: {
      storeId,
      orderNumber: "AUR-ORD-0001",
      customerId: customers[3].id,
      orderDate: daysAgo(2),
      expectedDate: daysFromNow(10),
      status: "DRAFT",
      locationId: location.id,
      createdByName: "Priya Nair",
      items: {
        create: [
          {
            itemName: "Custom Diamond Pendant",
            metalTypeId: metals.diamond.id,
            purity: PurityType.DIAMOND,
            estimatedWeight: 0.8,
            estimatedRate: 45000,
            designNotes: "Solitaire, 4-prong setting, customer's own rough stone excluded",
          },
        ],
      },
    },
  });

  // Draft order 2 — sent to a karigar (its own dedicated job).
  const draftJob = await prisma.karigarJob.create({
    data: {
      storeId,
      jobNumber: "AUR-JOB-0003",
      karigarId: karigars.iqbal.id,
      issueDate: daysAgo(4),
      expectedDate: daysFromNow(6),
      metalTypeId: metals.gold.id,
      issueWeight: 18,
      labourCharge: 2800,
      status: "issued",
      locationId: location.id,
    },
  });

  await prisma.draftOrder.create({
    data: {
      storeId,
      orderNumber: "AUR-ORD-0002",
      customerId: customers[4].id,
      orderDate: daysAgo(4),
      expectedDate: daysFromNow(6),
      status: "SENT_TO_KARIGAR",
      karigarJobId: draftJob.id,
      locationId: location.id,
      createdByName: "Priya Nair",
      items: {
        create: [
          {
            itemName: "Custom Gold Bangle Pair",
            metalTypeId: metals.gold.id,
            purity: PurityType.GOLD_22K,
            quantity: 2,
            estimatedWeight: 18,
            estimatedRate: 6450,
            designNotes: "Matte finish, customer-supplied design photo on file",
          },
        ],
      },
    },
  });
}

// ---------------------------------------------------------------------------
// 12. Standalone Payment In / Payment Out (on-account, not tied to a doc)
// ---------------------------------------------------------------------------

async function seedStandalonePayments(
  storeId: string,
  customers: { id: string; name: string }[],
  vendors: { id: string; name: string }[],
  karigars: { ganesh: { id: string; name?: string } },
  location: { id: string },
) {
  await prisma.ledgerEntry.create({
    data: {
      storeId,
      entryDate: daysAgo(1),
      type: LedgerEntryType.CREDIT,
      sourceType: LedgerSourceType.PAYMENT_IN,
      customerId: customers[4].id,
      amount: 3000,
      paymentMethod: PaymentMethod.UPI,
      locationId: location.id,
      description: `On-account payment received from ${customers[4].name}`,
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      storeId,
      entryDate: daysAgo(2),
      type: LedgerEntryType.DEBIT,
      sourceType: LedgerSourceType.PAYMENT_OUT,
      vendorId: vendors[0].id,
      amount: 15000,
      paymentMethod: PaymentMethod.NET_BANKING,
      locationId: location.id,
      description: `On-account payment made to ${vendors[0].name}`,
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      storeId,
      entryDate: daysAgo(1),
      type: LedgerEntryType.CREDIT,
      sourceType: LedgerSourceType.PAYMENT_OUT,
      karigarId: karigars.ganesh.id,
      amount: 2000,
      paymentMethod: PaymentMethod.CASH,
      locationId: location.id,
      description: "On-account payment made to Ganesh Patil",
    },
  });
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const { store, mainShowroom, warehouse } = await seedStoreShell();
  const taxonomy = await seedTaxonomy(store.id);

  await seedBusinessSettings(store.id, [
    "MONEY",
    taxonomy.metals.gold.id,
    taxonomy.metals.silver.id,
    taxonomy.metals.diamond.id,
  ]);

  await seedUsers(store.id);
  const customers = await seedCustomers(store.id);
  const vendors = await seedVendors(store.id);
  const karigars = await seedKarigars(store.id, taxonomy.metals, mainShowroom.id);

  const { products, stockByCode } = await seedProductsAndStock(
    store.id,
    taxonomy.categories,
    taxonomy.categoryTypes,
    taxonomy.metals,
    { mainShowroom, warehouse },
  );

  const invoices = await seedInvoices(
    store.id,
    customers,
    stockByCode,
    taxonomy.metals,
    taxonomy.gstRates,
    mainShowroom,
  );

  const paidInvoiceForReturn = invoices[0];
  await seedCreditNote(store.id, paidInvoiceForReturn.id, customers[0].id);

  await seedQuotations(store.id, customers, taxonomy.gstRates.gst3, mainShowroom);
  await seedKachaSlips(store.id, customers, stockByCode, mainShowroom);
  await seedPurchases(store.id, vendors, products, taxonomy.metals, taxonomy.gstRates, warehouse);
  await seedKarigarJobsAndDraftOrders(store.id, karigars, taxonomy.metals, customers, mainShowroom);
  await seedStandalonePayments(store.id, customers, vendors, karigars, mainShowroom);

  console.log(`\nDemo store ready: "${STORE_NAME}" (code ${STORE_CODE}).`);
  console.log("Switch stores as Super Admin (store switcher) to explore it.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("Full demo seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
