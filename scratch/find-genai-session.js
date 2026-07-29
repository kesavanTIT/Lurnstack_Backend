const prisma = require('../src/config/db');

async function main() {
  console.log('=== FIND KESAVAN OR GEN AI SESSIONS ===');
  const sessions = await prisma.liveSession.findMany({
    where: {
      OR: [
        { title: { contains: 'Gen AI', mode: 'insensitive' } },
        { title: { contains: 'Gen ai', mode: 'insensitive' } },
        { courseTitle: { contains: 'Gen AI', mode: 'insensitive' } },
        { courseTitle: { contains: 'Gen ai', mode: 'insensitive' } },
        { trainer: { fullName: { contains: 'Kesavan', mode: 'insensitive' } } }
      ]
    },
    include: {
      trainer: true
    }
  });
  console.log('Found sessions count:', sessions.length);
  console.log(JSON.stringify(sessions, null, 2));

  console.log('\n=== ALL USERS IN DB ===');
  const users = await prisma.user.findMany({
    select: { id: true, fullName: true, email: true, role: true }
  });
  console.log(JSON.stringify(users, null, 2));
}

main()
  .catch(err => console.error(err))
  .finally(() => prisma.$disconnect());
