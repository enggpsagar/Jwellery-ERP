const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT id, migration_name, started_at, finished_at, rolled_back_at
    FROM "_prisma_migrations"
    ORDER BY started_at;
  `);

  console.table(rows);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });