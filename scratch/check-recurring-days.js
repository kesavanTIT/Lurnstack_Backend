const prisma = require("../src/config/db");

async function main() {
  const sessions = await prisma.liveSession.findMany({
    where: { status: { not: "deleted" } },
    select: {
      id: true,
      title: true,
      isRecurring: true,
      recurringDays: true,
      recurrenceEndDate: true,
      trainer: { select: { fullName: true } }
    }
  });

  console.log("Active live sessions recurring info:");
  sessions.forEach((s) => {
    console.log(`- Title: "${s.title}" (${s.trainer?.fullName})`);
    console.log(`  isRecurring: ${s.isRecurring}`);
    console.log(`  recurringDays (raw): ${s.recurringDays} (Type: ${typeof s.recurringDays})`);
    console.log(`  recurrenceEndDate: ${s.recurrenceEndDate}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
