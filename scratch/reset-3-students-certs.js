const prisma = require('../src/config/db');

const emails = [
  'sharveshgukanv2007@gmail.com',
  'anulubbie17@gmail.com',
  'msnegamothilal@gmail.com'
];

async function resetCerts() {
  console.log("=== Finding Users and Resetting Certificates ===");

  const users = await prisma.user.findMany({
    where: {
      email: { in: emails, mode: 'insensitive' }
    },
    select: { id: true, fullName: true, email: true }
  });

  console.log("Found Users in DB:", users);

  if (!users.length) {
    console.log("No matching users found by exact email. Searching by substring...");
    const allUsers = await prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: "sharvesh", mode: "insensitive" } },
          { email: { contains: "anu", mode: "insensitive" } },
          { email: { contains: "snega", mode: "insensitive" } }
        ]
      },
      select: { id: true, fullName: true, email: true }
    });
    console.log("Matching Users:", allUsers);
  }

  const userIds = users.map(u => u.id);

  if (userIds.length > 0) {
    // Delete any old certificate records for these 3 users so clicking 'View Certificate' triggers a fresh generation
    const deleted = await prisma.certificate.deleteMany({
      where: {
        userId: { in: userIds }
      }
    });
    console.log(`✅ Reset complete! Deleted ${deleted.count} old certificate records for users:`, userIds);
  }
}

resetCerts()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
