const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const result = await prisma.$queryRawUnsafe(`
    SELECT migration_name, finished_at, rolled_back_at, logs
    FROM "_prisma_migrations"
    WHERE migration_name = '20260710092739_add_gold18k_rate';
  `);

  console.log(result);
}

main()
  .finally(() => prisma.$disconnect());