const prisma = require("../src/config/db");

async function main() {
  const sessions = await prisma.liveSession.findMany({
    select: {
      id: true,
      title: true,
      category: true,
      isTridinOnly: true,
      trainerId: true,
      trainer: { select: { fullName: true, email: true } }
    },
    take: 20
  });
  console.log("Total sessions found:", sessions.length);
  sessions.forEach(s => {
    console.log(`[ID ${s.id}] Title: "${s.title}" | Category: "${s.category}" | isTridinOnly: ${s.isTridinOnly} | Trainer: ${s.trainer?.email}`);
  });
  await prisma.$disconnect();
}
main().catch(console.error);
