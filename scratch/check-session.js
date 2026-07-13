const prisma = require('../src/config/db');

async function checkSession() {
  const sessionId = '0404ab9d-2b0f-4338-ad6c-e43cfe78904c';
  
  console.log(`Checking LiveSession with ID/courseId ending in ${sessionId}...`);
  
  const session = await prisma.liveSession.findFirst({
    where: {
      OR: [
        { id: sessionId },
        { courseId: `standalone-${sessionId}` },
        { courseId: sessionId }
      ]
    },
    include: { trainer: true }
  });

  if (!session) {
    console.error('❌ LiveSession not found!');
    return;
  }

  console.log('✅ Found Session:');
  console.log(JSON.stringify(session, null, 2));

  console.log('\nChecking SessionOccurrences...:');
  const occurrences = await prisma.sessionOccurrence.findMany({
    where: {
      sessionId: session.id
    },
    orderBy: {
      occurrenceDate: 'asc'
    }
  });

  console.log(`Total occurrences found: ${occurrences.length}`);
  occurrences.forEach(o => {
    console.log(`- Date: ${o.occurrenceDate.toISOString()} | startsAt: ${o.startsAt.toISOString()} | status: ${o.status}`);
  });
}

checkSession().catch(console.error);
