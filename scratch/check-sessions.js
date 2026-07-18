const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("=== LIVESESSION TABLE ===");
  const sessions = await prisma.liveSession.findMany({
    where: { status: "active", deleteRequested: false },
    include: { trainer: { select: { fullName: true } } },
  });
  console.log(`Found ${sessions.length} active sessions:`);
  sessions.forEach((s) => {
    console.log(`- ID: ${s.id}, Title: ${s.title}, Trainer: ${s.trainer?.fullName}, CreatedAt: ${s.createdAt}`);
  });

  console.log("\n=== LIVECLASS TABLE ===");
  const liveClasses = await prisma.liveClass.findMany();
  console.log(`Found ${liveClasses.length} live classes:`);
  liveClasses.forEach((c) => {
    console.log(`- ID: ${c.id}, CourseName: ${c.courseName}, ClassTitle: ${c.classTitle}, Instructor: ${c.instructor}, CreatedAt: ${c.createdAt}`);
  });

  console.log("\n=== SESSIONOCCURRENCE TABLE (TODAY) ===");
  const occurrences = await prisma.sessionOccurrence.findMany({
    include: {
      session: { select: { title: true } },
      trainer: { select: { fullName: true } },
    },
  });
  console.log(`Found ${occurrences.length} occurrences:`);
  occurrences.forEach((o) => {
    console.log(`- ID: ${o.id}, Session: ${o.session?.title}, Trainer: ${o.trainer?.fullName}, Date: ${o.occurrenceDate}, StartsAt: ${o.startsAt}`);
  });
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
