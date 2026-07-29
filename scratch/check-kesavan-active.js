const prisma = require('../src/config/db');

async function main() {
  console.log('=== CHECKING ACTIVE SESSIONS FOR KESAVAN ===');
  const activeSessions = await prisma.liveSession.findMany({
    where: {
      trainer: { email: { contains: 'kesavan', mode: 'insensitive' } },
      status: 'active'
    }
  });

  console.log('Active Sessions found:', activeSessions.length);
  for (const s of activeSessions) {
    console.log(`ID: ${s.id} | Title: ${s.title} | CourseTitle: ${s.courseTitle} | RecurrenceEndDate: ${s.recurrenceEndDate}`);
  }
}

main()
  .catch(err => console.error(err))
  .finally(() => prisma.$disconnect());
