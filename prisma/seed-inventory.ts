import { PrismaClient, InventoryCategory, MetalType, OrnamentType, PurityType, InventoryStockStatus } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  // clear in safe order if needed
  await prisma.inventoryStock.deleteMany()
  await prisma.product.deleteMany()

  const products = [
    {
      productCode: "PRD-RING-22K-001",
      name: "Classic Gold Ring",
      category: InventoryCategory.ORNAMENT,
      ornamentType: OrnamentType.RING,
      metalType: MetalType.GOLD,
      defaultPurity: PurityType.GOLD_22K,
      defaultMakingCharge: 850,
      defaultStoneCharge: 0,
      designCode: "RNG-001",
      description: "Classic everyday gold ring",
      stockItems: {
        create: [
          {
            stockCode: "STK-RING-001-A",
            metalType: MetalType.GOLD,
            purity: PurityType.GOLD_22K,
            quantity: 1,
            status: InventoryStockStatus.IN_STOCK,
            grossWeight: 5.200,
            netWeight: 5.000,
            lessWeight: 0.200,
            purchaseRate: 6100,
            saleRate: 6450,
            makingCharge: 900,
            stoneCharge: 0,
            purchaseAmount: 31720,
            saleAmount: 33150,
            location: "Tray A1",
            remarks: "Size 14",
          },
          {
            stockCode: "STK-RING-001-B",
            metalType: MetalType.GOLD,
            purity: PurityType.GOLD_22K,
            quantity: 1,
            status: InventoryStockStatus.IN_STOCK,
            grossWeight: 6.100,
            netWeight: 5.850,
            lessWeight: 0.250,
            purchaseRate: 6100,
            saleRate: 6450,
            makingCharge: 1100,
            stoneCharge: 0,
            purchaseAmount: 37110,
            saleAmount: 38832.5,
            location: "Tray A1",
            remarks: "Size 17",
          },
        ],
      },
    },

    {
      productCode: "PRD-NECK-22K-001",
      name: "Lakshmi Necklace Set",
      category: InventoryCategory.ORNAMENT,
      ornamentType: OrnamentType.NECKLACE,
      metalType: MetalType.GOLD,
      defaultPurity: PurityType.GOLD_22K,
      defaultMakingCharge: 4500,
      defaultStoneCharge: 2500,
      designCode: "NEC-001",
      description: "Traditional necklace set",
      stockItems: {
        create: [
          {
            stockCode: "STK-NECK-001-A",
            metalType: MetalType.GOLD,
            purity: PurityType.GOLD_22K,
            quantity: 1,
            status: InventoryStockStatus.IN_STOCK,
            grossWeight: 38.500,
            netWeight: 36.900,
            lessWeight: 1.600,
            stoneWeight: 1.200,
            purchaseRate: 6100,
            saleRate: 6480,
            makingCharge: 5200,
            stoneCharge: 3000,
            purchaseAmount: 225090,
            saleAmount: 247112,
            location: "Necklace Shelf 1",
            remarks: "Temple design",
          },
        ],
      },
    },

    {
      productCode: "PRD-CHAIN-22K-001",
      name: "Machine Gold Chain",
      category: InventoryCategory.ORNAMENT,
      ornamentType: OrnamentType.CHAIN,
      metalType: MetalType.GOLD,
      defaultPurity: PurityType.GOLD_22K,
      defaultMakingCharge: 1500,
      defaultStoneCharge: 0,
      designCode: "CHN-001",
      description: "22K chain for daily wear",
      stockItems: {
        create: [
          {
            stockCode: "STK-CHAIN-001-A",
            metalType: MetalType.GOLD,
            purity: PurityType.GOLD_22K,
            quantity: 1,
            status: InventoryStockStatus.IN_STOCK,
            grossWeight: 14.250,
            netWeight: 13.900,
            lessWeight: 0.350,
            purchaseRate: 6100,
            saleRate: 6425,
            makingCharge: 1700,
            purchaseAmount: 84790,
            saleAmount: 91007.5,
            location: "Chain Rack 1",
            remarks: "18 inch",
          },
        ],
      },
    },

    {
      productCode: "PRD-BANGLE-22K-001",
      name: "Plain Gold Bangle",
      category: InventoryCategory.ORNAMENT,
      ornamentType: OrnamentType.BANGLE,
      metalType: MetalType.GOLD,
      defaultPurity: PurityType.GOLD_22K,
      defaultMakingCharge: 2200,
      defaultStoneCharge: 0,
      designCode: "BNG-001",
      description: "Plain pair bangle",
      stockItems: {
        create: [
          {
            stockCode: "STK-BANGLE-001-A",
            metalType: MetalType.GOLD,
            purity: PurityType.GOLD_22K,
            quantity: 2,
            status: InventoryStockStatus.IN_STOCK,
            grossWeight: 24.600,
            netWeight: 24.000,
            lessWeight: 0.600,
            purchaseRate: 6100,
            saleRate: 6450,
            makingCharge: 2600,
            purchaseAmount: 146400,
            saleAmount: 157400,
            location: "Bangle Box",
            remarks: "Pair size 2.4",
          },
        ],
      },
    },

    {
      productCode: "PRD-PAYAL-925-001",
      name: "Silver Payal Pair",
      category: InventoryCategory.ORNAMENT,
      ornamentType: OrnamentType.PAYAL,
      metalType: MetalType.SILVER,
      defaultPurity: PurityType.SILVER_925,
      defaultMakingCharge: 450,
      defaultStoneCharge: 0,
      designCode: "PAY-001",
      description: "Silver payal pair",
      stockItems: {
        create: [
          {
            stockCode: "STK-PAYAL-001-A",
            metalType: MetalType.SILVER,
            purity: PurityType.SILVER_925,
            quantity: 2,
            status: InventoryStockStatus.IN_STOCK,
            grossWeight: 52.500,
            netWeight: 51.300,
            lessWeight: 1.200,
            purchaseRate: 82,
            saleRate: 95,
            makingCharge: 650,
            purchaseAmount: 4206.6,
            saleAmount: 5523.5,
            location: "Silver Drawer 2",
            remarks: "Pair",
          },
        ],
      },
    },

    {
      productCode: "PRD-EAR-22K-001",
      name: "Gold Stud Earrings",
      category: InventoryCategory.ORNAMENT,
      ornamentType: OrnamentType.EARRING,
      metalType: MetalType.GOLD,
      defaultPurity: PurityType.GOLD_22K,
      defaultMakingCharge: 700,
      defaultStoneCharge: 0,
      designCode: "EAR-001",
      description: "Simple stud earrings",
      stockItems: {
        create: [
          {
            stockCode: "STK-EAR-001-A",
            metalType: MetalType.GOLD,
            purity: PurityType.GOLD_22K,
            quantity: 1,
            status: InventoryStockStatus.IN_STOCK,
            grossWeight: 3.850,
            netWeight: 3.700,
            lessWeight: 0.150,
            purchaseRate: 6100,
            saleRate: 6450,
            makingCharge: 850,
            purchaseAmount: 22570,
            saleAmount: 24715,
            location: "Earring Tray",
            remarks: "Stud pair",
          },
        ],
      },
    },

    {
      productCode: "PRD-MANG-22K-001",
      name: "Mangalsutra Black Bead",
      category: InventoryCategory.ORNAMENT,
      ornamentType: OrnamentType.MANGALSUTRA,
      metalType: MetalType.GOLD,
      defaultPurity: PurityType.GOLD_22K,
      defaultMakingCharge: 2800,
      defaultStoneCharge: 0,
      designCode: "MAN-001",
      description: "Traditional mangalsutra",
      stockItems: {
        create: [
          {
            stockCode: "STK-MANG-001-A",
            metalType: MetalType.GOLD,
            purity: PurityType.GOLD_22K,
            quantity: 1,
            status: InventoryStockStatus.IN_STOCK,
            grossWeight: 19.300,
            netWeight: 18.700,
            lessWeight: 0.600,
            purchaseRate: 6100,
            saleRate: 6460,
            makingCharge: 3200,
            purchaseAmount: 114070,
            saleAmount: 124002,
            location: "Mangalsutra Rack",
            remarks: "Black bead chain",
          },
        ],
      },
    },

    {
      productCode: "PRD-COIN-GOLD-001",
      name: "Gold Coin 10gm",
      category: InventoryCategory.COIN,
      ornamentType: OrnamentType.COIN,
      metalType: MetalType.GOLD,
      defaultPurity: PurityType.GOLD_24K,
      defaultMakingCharge: 0,
      defaultStoneCharge: 0,
      designCode: "GC-10",
      description: "24K gold coin 10 gram",
      stockItems: {
        create: [
          {
            stockCode: "STK-GCOIN-001-A",
            metalType: MetalType.GOLD,
            purity: PurityType.GOLD_24K,
            quantity: 1,
            status: InventoryStockStatus.IN_STOCK,
            grossWeight: 10.000,
            netWeight: 10.000,
            purchaseRate: 7050,
            saleRate: 7250,
            makingCharge: 0,
            purchaseAmount: 70500,
            saleAmount: 72500,
            location: "Coin Locker",
            remarks: "10 gm coin",
          },
        ],
      },
    },

    {
      productCode: "PRD-COIN-SILVER-001",
      name: "Silver Coin 20gm",
      category: InventoryCategory.COIN,
      ornamentType: OrnamentType.COIN,
      metalType: MetalType.SILVER,
      defaultPurity: PurityType.SILVER_999,
      defaultMakingCharge: 0,
      defaultStoneCharge: 0,
      designCode: "SC-20",
      description: "999 silver coin 20 gram",
      stockItems: {
        create: [
          {
            stockCode: "STK-SCOIN-001-A",
            metalType: MetalType.SILVER,
            purity: PurityType.SILVER_999,
            quantity: 1,
            status: InventoryStockStatus.IN_STOCK,
            grossWeight: 20.000,
            netWeight: 20.000,
            purchaseRate: 88,
            saleRate: 105,
            makingCharge: 0,
            purchaseAmount: 1760,
            saleAmount: 2100,
            location: "Silver Coin Box",
            remarks: "20 gm silver coin",
          },
        ],
      },
    },
  ]

  for (const product of products) {
    await prisma.product.create({
      data: product,
    })
  }

  console.log("Jewellery inventory seed inserted successfully.")
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })