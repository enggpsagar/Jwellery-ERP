import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const jobs = await prisma.karigarJob.findMany({
    where: { jobNumber: { in: ["JOB-2026-0006", "JOB-2026-0007"] } },
    include: { karigar: { select: { name: true } } },
  });

  console.log("BEFORE:");
  for (const j of jobs) {
    console.log({
      jobNumber: j.jobNumber,
      karigar: j.karigar.name,
      status: j.status,
      issueWeight: j.issueWeight?.toString(),
      receiveWeight: j.receiveWeight?.toString(),
      receivedDate: j.receivedDate,
    });
  }

  const job6 = jobs.find((j) => j.jobNumber === "JOB-2026-0006");
  const job7 = jobs.find((j) => j.jobNumber === "JOB-2026-0007");

  if (!job6 || !job7) {
    throw new Error("One or both jobs not found — aborting without changes.");
  }

  // Harsh's job was closed early by the pre-fix bug after only ~4% received.
  // Reopen it so partial receiving can continue correctly.
  await prisma.karigarJob.update({
    where: { id: job6.id },
    data: { status: "issued", receivedDate: null },
  });

  // shree's job is functionally fully received (99.99997g of 100g issued —
  // the float-precision gap fixed by WEIGHT_TOLERANCE) but was stuck open
  // by the old strict >= comparison. Close it now that the balance is
  // genuinely settled.
  await prisma.karigarJob.update({
    where: { id: job7.id },
    data: { status: "received", receivedDate: new Date() },
  });

  const after = await prisma.karigarJob.findMany({
    where: { jobNumber: { in: ["JOB-2026-0006", "JOB-2026-0007"] } },
    include: { karigar: { select: { name: true } } },
  });

  console.log("\nAFTER:");
  for (const j of after) {
    console.log({
      jobNumber: j.jobNumber,
      karigar: j.karigar.name,
      status: j.status,
      issueWeight: j.issueWeight?.toString(),
      receiveWeight: j.receiveWeight?.toString(),
      receivedDate: j.receivedDate,
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
