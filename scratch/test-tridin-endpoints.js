const prisma = require("../src/config/db");

async function main() {
  console.log("Checking Tridin sessions in DB...");
  const sessions = await prisma.liveSession.findMany({
    where: {
      isTridinOnly: true,
      status: { not: "deleted" },
      deleteRequested: false,
    },
    select: {
      id: true,
      title: true,
      courseTitle: true,
      isTridinOnly: true,
      meetingLink: true,
      status: true,
      _count: {
        select: { tridinVideos: true }
      }
    }
  });

  console.log(`Found ${sessions.length} Tridin session(s):`);
  sessions.forEach((s) => {
    console.log(`- ID: ${s.id} | Title: "${s.title}" | Course: "${s.courseTitle}" | VideoCount: ${s._count.tridinVideos} | MeetLink: ${s.meetingLink || "none"}`);
  });
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
