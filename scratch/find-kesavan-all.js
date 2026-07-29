const prisma = require('../src/config/db');

async function main() {
  console.log('=== KESAVAN ALL SESSIONS ===');
  const sessions = await prisma.liveSession.findMany({
    where: {
      trainer: { email: { contains: 'kesavan', mode: 'insensitive' } }
    },
    include: {
      trainer: true
    }
  });
  console.log('Count:', sessions.length);
  console.log(JSON.stringify(sessions, null, 2));
}

main()
  .catch(err => console.error(err))
  .finally(() => prisma.$disconnect());
