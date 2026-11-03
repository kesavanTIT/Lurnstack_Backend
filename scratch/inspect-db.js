const prisma = require("../src/config/db");

async function main() {
  const sessions = await prisma.liveSession.findMany({
    select: {
      id: true,
      title: true,
      targetAudience: true,
      isTridinOnly: true,
      publishState: true,
      meetingLink: true,
      updatedAt: true
    },
    orderBy: { updatedAt: "desc" }
  });
  console.log("Total sessions:", sessions.length);
  console.log(sessions);
}

main().catch(console.error).finally(() => prisma.$disconnect());
