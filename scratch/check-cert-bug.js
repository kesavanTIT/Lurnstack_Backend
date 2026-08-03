const prisma = require('../src/config/db');

async function run() {
  const certs = await prisma.certificate.findMany({
    include: { user: true }
  });
  console.log('Certificates:', JSON.stringify(certs, null, 2));

  const occurrences = await prisma.sessionOccurrence.findMany({
    orderBy: { startsAt: 'asc' }
  });
  console.log('Occurrences count:', occurrences.length);
  if (occurrences.length > 0) {
    console.log('First occurrence:', occurrences[0]);
    console.log('Last occurrence:', occurrences[occurrences.length - 1]);
  }

  const completedOccurrences = await prisma.sessionOccurrence.findMany({
    where: { status: "COMPLETED" },
    orderBy: { startsAt: 'asc' }
  });
  console.log('Completed Occurrences count:', completedOccurrences.length);
  completedOccurrences.forEach(o => {
    console.log('  Occurrence:', o.id, o.startsAt, o.endsAt, o.status);
  });

  const sessions = await prisma.liveSession.findMany({});
  console.log('Sessions:', JSON.stringify(sessions.map(s => ({
    id: s.id,
    title: s.title,
    courseTitle: s.courseTitle,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    duration: s.duration,
    occurrencesCount: s.occurrencesCount
  })), null, 2));
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
