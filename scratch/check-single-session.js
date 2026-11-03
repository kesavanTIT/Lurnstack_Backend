const prisma = require("../src/config/db");

async function check() {
  const s = await prisma.liveSession.findUnique({
    where: { id: "732d4b9a-8b5d-4e92-a00a-6f4f2f90f22b" },
    include: {
      trainer: true,
      occurrences: true,
      _count: { select: { tridinVideos: true } }
    }
  });

  console.log("Session:", {
    title: s?.title,
    trainer: s?.trainer ? s.trainer.fullName : "NO TRAINER",
    recurrenceEndDate: s?.recurrenceEndDate,
    recurringDays: s?.recurringDays,
  });
}

check().catch(console.error).finally(() => prisma.$disconnect());
