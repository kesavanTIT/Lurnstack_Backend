const prisma = require("../src/config/db");

async function testTridinLiveSessions() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const sessions = await prisma.liveSession.findMany({
    where: {
      status: { not: "deleted" },
      deleteRequested: false,
      OR: [
        { isTridinOnly: true },
        { targetAudience: "TRIDIN" },
        { targetAudience: "BOTH" },
      ],
      meetingLink: {
        not: null,
      },
      NOT: [
        { meetingLink: "" },
        { meetingLink: "null" },
        { meetingLink: "undefined" },
      ],
    },
    include: {
      trainer: {
        select: {
          id: true,
          fullName: true,
          profilePhotoUrl: true,
          email: true,
        },
      },
      occurrences: {
        where: {
          occurrenceDate: {
            gte: yesterday,
          },
        },
        orderBy: {
          startsAt: "asc",
        },
        take: 10,
      },
      _count: {
        select: { tridinVideos: true },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  console.log(`Backend query found ${sessions.length} sessions.`);
  sessions.forEach(s => {
    console.log(`- ${s.title}: status=${s.status}, isTridinOnly=${s.isTridinOnly}, targetAudience=${s.targetAudience}, meetingLink=${s.meetingLink}`);
  });
}

testTridinLiveSessions()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
