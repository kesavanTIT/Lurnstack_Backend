const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const sessions = await prisma.session.findMany({
    where: {
      OR: [
        { category: { contains: 'tridin', mode: 'insensitive' } },
        { isTridinOnly: true }
      ]
    },
    select: { id: true, title: true, category: true, isTridinOnly: true }
  });
  console.log('Tridin sessions in DB:', sessions);
  await prisma.$disconnect();
}
main().catch(console.error);
