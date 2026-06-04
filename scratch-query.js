const prisma = require('./src/config/db');

async function main() {
  const liveClasses = await prisma.liveClass.findMany({
    select: { id: true, classTitle: true, thumbnail: true }
  });
  console.log('--- Live Classes ---');
  console.log(liveClasses);

  const liveSessions = await prisma.liveSession.findMany({
    select: { id: true, title: true, thumbnail: true }
  });
  console.log('--- Live Sessions ---');
  console.log(liveSessions);
}

main().catch(err => {
  console.error(err);
}).finally(() => {
  prisma.$disconnect();
});
