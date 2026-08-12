// FILE PATH: prisma/seed-karigars.ts
//
// Run with: npx tsx prisma/seed-karigars.ts
// (or: npx prisma db seed, if you wire this into package.json's prisma.seed config)

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const karigars = [
  {
    code: "KAR001",
    name: "Ramesh Sonar",
    mobile: "9876543210",
    whatsapp: "9876543210",
    email: "ramesh.sonar@example.com",
    address: "12 Sarafa Bazaar",
    city: "Nagpur",
    pincode: "440001",
    gstNumber: "27ABCDE1234F1Z5",
    panNumber: "ABCDE1234F",
    aadhaarNumber: "234567890123",
    specialization: "Chain making",
    notes: "Reliable, 10+ years experience with gold chains",
    openingGold: 25.5,
    openingCash: 5000,
    isActive: true,
  },
  {
    code: "KAR002",
    name: "Suresh Patil",
    mobile: "9823456781",
    whatsapp: "9823456781",
    email: "suresh.patil@example.com",
    address: "45 Jewellers Lane",
    city: "Pune",
    pincode: "411001",
    gstNumber: "27FGHIJ5678K1Z2",
    panNumber: "FGHIJ5678K",
    aadhaarNumber: "345678901234",
    specialization: "Stone setting",
    notes: "Specializes in kundan and polki work",
    openingGold: 10.0,
    openingCash: 2500,
    isActive: true,
  },
  {
    code: "KAR003",
    name: "Manoj Kumar",
    mobile: "9765432109",
    whatsapp: "9765432110",
    email: "manoj.kumar@example.com",
    address: "8 Zaveri Street",
    city: "Mumbai",
    pincode: "400002",
    gstNumber: "27KLMNO9012P1Z8",
    panNumber: "KLMNO9012P",
    aadhaarNumber: "456789012345",
    specialization: "Bangle and kada making",
    notes: "Fast turnaround, works mainly in 22K gold",
    openingGold: 40.75,
    openingCash: 8000,
    isActive: true,
  },
  {
    code: "KAR004",
    name: "Vijay Shinde",
    mobile: "9654321098",
    whatsapp: null,
    email: null,
    address: "22 Gold Market Road",
    city: "Nashik",
    pincode: "422001",
    gstNumber: null,
    panNumber: "QRSTU3456V",
    aadhaarNumber: "567890123456",
    specialization: "Ring making",
    notes: "New karigar, onboarded this quarter",
    openingGold: 0,
    openingCash: 0,
    isActive: true,
  },
  {
    code: "KAR005",
    name: "Anil Deshmukh",
    mobile: "9543210987",
    whatsapp: "9543210987",
    email: "anil.deshmukh@example.com",
    address: "5 Old Sarafa Market",
    city: "Nagpur",
    pincode: "440002",
    gstNumber: "27VWXYZ7890A1Z1",
    panNumber: "VWXYZ7890A",
    aadhaarNumber: "678901234567",
    specialization: "Necklace and mangalsutra",
    notes: "Currently inactive - on leave",
    openingGold: 15.25,
    openingCash: 3200,
    isActive: false,
  },
];

async function main() {
  console.log(`Seeding ${karigars.length} karigars...`);

  for (const karigar of karigars) {
    const result = await prisma.karigar.upsert({
      where: { code: karigar.code },
      update: karigar,
      create: karigar,
    });
    console.log(`  ✓ ${result.name} (${result.code})`);
  }

  console.log("Done.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });