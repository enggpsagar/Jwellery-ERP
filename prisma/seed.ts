import { PrismaClient, UserRole, UserStatus } from "@prisma/client"
import { INDIA_STATES_AND_CITIES } from "./india-states-cities"

const prisma = new PrismaClient()

async function seedStatesAndCities() {
  console.log("Starting seed...")
  console.log(`Found ${INDIA_STATES_AND_CITIES.length} states/UTs for India.`)

  for (const stateData of INDIA_STATES_AND_CITIES) {
    const state = await prisma.state.upsert({
      where: { isoCode: stateData.code },
      update: {
        name: stateData.name,
        country: "India",
      },
      create: {
        name: stateData.name,
        isoCode: stateData.code,
        country: "India",
      },
    })

    const cityData = stateData.cities.map((cityName) => ({
      name: cityName,
      stateId: state.id,
    }))

    await prisma.city.createMany({
      data: cityData,
      skipDuplicates: true,
    })

    console.log(
      `Seeded ${stateData.name} (${stateData.cities.length} cities)`
    )
  }

  console.log("States and cities seeded successfully.")
}

async function seedAuthData() {
  console.log("Seeding auth data...")

  const adminEmail = "admin@yourdomain.com"

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: "Admin User",
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      isEmailVerified: true,
      phoneVerified: false,
    },
    create: {
      name: "Admin User",
      email: adminEmail,
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      isEmailVerified: true,
      phoneVerified: false,
    },
  })

  console.log(`Seeded default admin: ${adminEmail}`)
}

async function main() {
  try {
    await seedStatesAndCities()
    await seedAuthData()
  } catch (e) {
    console.error("Seed failed:", e)
    throw e
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })