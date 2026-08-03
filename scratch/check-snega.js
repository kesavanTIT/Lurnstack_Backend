const prisma = require('../src/config/db');

async function listUsers() {
  const users = await prisma.user.findMany({
    select: { id: true, fullName: true, email: true, role: true }
  });
  console.log('Users in DB:', users);
}

listUsers()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
