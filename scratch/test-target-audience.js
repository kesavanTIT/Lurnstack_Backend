const prisma = require("../src/config/db");

async function test() {
  console.log("Checking targetAudience values in liveSession...");
  const sessions = await prisma.liveSession.findMany({
    select: {
      id: true,
      title: true,
      targetAudience: true,
      isTridinOnly: true,
    },
    take: 6,
  });

  console.log("Sample sessions:", sessions);

  // Test Tridin query:
  const tridinSessions = await prisma.liveSession.findMany({
    where: {
      status: { not: "deleted" },
      deleteRequested: false,
      OR: [
        { isTridinOnly: true },
        { targetAudience: "TRIDIN" },
        { targetAudience: "BOTH" },
      ],
    },
    select: { id: true, title: true, targetAudience: true, isTridinOnly: true },
  });

  console.log(`\nTridin candidate query matches ${tridinSessions.length} session(s):`);
  tridinSessions.forEach(s => console.log(`- ${s.title} [targetAudience: ${s.targetAudience}, isTridinOnly: ${s.isTridinOnly}]`));
}

test()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
