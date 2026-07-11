const prisma = require('../src/config/db');

async function listAllUsers() {
  const users = await prisma.user.findMany({
    select: { id: true, fullName: true, email: true }
  });

  console.log(`Total users in DB: ${users.length}`);
  users.forEach(u => console.log(`- ID: ${u.id}, Name: ${u.fullName}, Email: ${u.email}`));
}

listAllUsers()
  .catch(err => console.error(err))
  .finally(() => prisma.$disconnect());
