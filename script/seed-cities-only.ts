import { PrismaClient } from "@prisma/client"
import { INDIA_STATES_AND_CITIES } from "../prisma/india-states-cities"

const prisma = new PrismaClient()

async function main() {
  console.log(`Found ${INDIA_STATES_AND_CITIES.length} states/UTs for India.`)

  for (const stateData of INDIA_STATES_AND_CITIES) {
    const state = await prisma.state.upsert({
      where: { isoCode: stateData.code },
      update: { name: stateData.name, country: "India" },
      create: { name: stateData.name, isoCode: stateData.code, country: "India" },
    })

    const before = await prisma.city.count({ where: { stateId: state.id } })

    const cityData = stateData.cities.map((cityName) => ({
      name: cityName,
      stateId: state.id,
    }))

    await prisma.city.createMany({ data: cityData, skipDuplicates: true })

    const after = await prisma.city.count({ where: { stateId: state.id } })

    console.log(
      `${stateData.name}: ${before} -> ${after} cities (+${after - before})`,
    )
  }

  console.log("Done.")
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
