const prisma = require('../src/config/db');

async function main() {
  console.log('=== ALL LIVE SESSIONS ===');
  const sessions = await prisma.liveSession.findMany({
    where: { status: { not: 'deleted' } },
    include: {
      trainer: { select: { id: true, fullName: true, email: true } },
    }
  });
  console.log(JSON.stringify(sessions, null, 2));

  console.log('\n=== ALL BOOKINGS / CERTIFICATES ===');
  const bookings = await prisma.booking.findMany({
    take: 20,
    orderBy: { createdAt: 'desc' },
    include: {
      student: { select: { id: true, fullName: true, email: true } }
    }
  });
  console.log(JSON.stringify(bookings, null, 2));
}

main()
  .catch(err => console.error(err))
  .finally(() => prisma.$disconnect());
