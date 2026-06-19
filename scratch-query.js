const prisma = require('./src/config/db');

async function main() {
  console.log('=== LiveClass Records ===');
  const liveClasses = await prisma.liveClass.findMany();
  console.log(JSON.stringify(liveClasses, null, 2));

  console.log('\n=== LiveSession Records ===');
  const liveSessions = await prisma.liveSession.findMany({
    select: {
      id: true,
      courseId: true,
      trainerId: true,
      title: true,
      startTime: true,
      endTime: true,
      sectionType: true,
      sessionType: true,
      source: true,
      courseTitle: true,
      scheduledDate: true,
      isRecurring: true,
      createdAt: true
    }
  });
  console.log(JSON.stringify(liveSessions, null, 2));

  console.log('\n=== SessionOccurrence Records ===');
  const occurrences = await prisma.sessionOccurrence.findMany({
    include: {
      session: {
        select: {
          title: true,
          sectionType: true
        }
      }
    }
  });
  console.log(JSON.stringify(occurrences, null, 2));
}

main().catch(err => {
  console.error(err);
}).finally(() => {
  prisma.$disconnect();
});
