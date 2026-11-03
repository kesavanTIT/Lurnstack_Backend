const prisma = require("../src/config/db");

async function run() {
  const sessions = await prisma.liveSession.findMany({
    select: {
      id: true,
      title: true,
      meetingLink: true,
      targetAudience: true,
      isTridinOnly: true,
      status: true,
      deleteRequested: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  console.log("Recent 10 live sessions:");
  console.log(JSON.stringify(sessions, null, 2));
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
