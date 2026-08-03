const prisma = require('../src/config/db');

const defaultEmails = [
  'sharveshgukanv2007@gmail.com',
  'anulubbie17@gmail.com',
  'msnegamothilal@gmail.com',
  'sanjaysiva0829@gmail.com'
];

const cliEmail = process.argv[2];
const emails = cliEmail ? [cliEmail] : defaultEmails;

async function resetStudentCertificates() {
  console.log("=== Resetting Stored Certificates for Students ===");
  console.log("Target emails:", emails);

  const users = await prisma.user.findMany({
    where: {
      email: { in: emails, mode: 'insensitive' }
    },
    select: { id: true, fullName: true, email: true }
  });

  console.log("Found Student Users:", users);

  if (users.length > 0) {
    const userIds = users.map(u => u.id);
    const deleted = await prisma.certificate.deleteMany({
      where: {
        userId: { in: userIds }
      }
    });
    console.log(`✅ Successfully deleted ${deleted.count} old certificate records from DB for users:`, userIds);
    console.log("Now when these students log in to Student Portal and click 'View Certificate', backend will generate a brand new verified PDF!");
  } else {
    console.log("No matching users found by email in this DB.");
  }
}

resetStudentCertificates()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
