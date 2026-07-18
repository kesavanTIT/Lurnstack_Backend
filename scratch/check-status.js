const prisma = require("../src/config/db");

async function main() {
  const sessions = await prisma.liveSession.findMany({
    select: {
      id: true,
      title: true,
      status: true,
      publishState: true,
      trainer: { select: { fullName: true } }
    }
  });

  console.log("All sessions status:");
  sessions.forEach((s) => {
    console.log(`- "${s.title}" (${s.trainer?.fullName}): status=${s.status}, publishState=${s.publishState}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
