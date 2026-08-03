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

  // 1. Find matching users by email
  const users = await prisma.user.findMany({
    where: {
      email: { in: emails, mode: 'insensitive' }
    },
    select: { id: true, fullName: true, email: true }
  });

  console.log("Found Student Users:", users);

  const userIds = users.map(u => u.id);
  const userNames = users.map(u => u.fullName).filter(Boolean);

  // 2. Find existing certificates in DB before deleting
  const existingCerts = await prisma.certificate.findMany({
    where: {
      OR: [
        { userId: { in: userIds } },
        ...userNames.map(name => ({ studentName: { contains: name, mode: 'insensitive' } })),
        ...emails.map(email => ({ user: { email: { equals: email, mode: 'insensitive' } } }))
      ]
    },
    include: {
      user: { select: { id: true, email: true, fullName: true } }
    }
  });

  console.log("Found Certificates to Delete:", existingCerts);

  // 3. Delete matching certificates
  if (existingCerts.length > 0) {
    const certIds = existingCerts.map(c => c.id);
    const deleted = await prisma.certificate.deleteMany({
      where: {
        id: { in: certIds }
      }
    });
    console.log(`✅ Successfully deleted ${deleted.count} old certificate records from DB.`);
    console.log("Now when these students log in to Student Portal and click 'View Certificate', backend will generate a brand new verified PDF!");
  } else {
    console.log("No matching certificates found in DB. Checking all certificates in DB...");
    const totalCertsCount = await prisma.certificate.count();
    console.log("Total Certificate count in DB:", totalCertsCount);
    if (totalCertsCount > 0) {
      const sampleCerts = await prisma.certificate.findMany({
        take: 10,
        select: { id: true, userId: true, studentName: true, courseName: true, createdAt: true }
      });
      console.log("Sample certificates in DB:", sampleCerts);
    }
  }
}

resetStudentCertificates()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
