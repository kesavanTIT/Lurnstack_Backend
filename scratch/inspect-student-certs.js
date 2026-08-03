const prisma = require('../src/config/db');

async function inspectCerts() {
  console.log("=== Searching for Database / Oracle SQL courses & session certs ===");

  const certs = await prisma.certificate.findMany({
    take: 20,
    orderBy: { updatedAt: 'desc' },
    include: {
      user: { select: { id: true, fullName: true, email: true } }
    }
  });

  console.log("Existing Certificates in DB:");
  certs.forEach(c => {
    console.log(`- Cert ID: ${c.id} | CertNumber: ${c.certificateId} | Student: ${c.studentName || c.user?.fullName} (User ${c.userId}) | Course: ${c.courseName} (${c.courseId}) | Status: ${c.paymentStatus} | Url: ${c.certificateUrl}`);
  });

  console.log("\n=== Live Sessions for Database / Oracle SQL ===");
  const sessions = await prisma.liveSession.findMany({
    where: {
      OR: [
        { title: { contains: "Database", mode: "insensitive" } },
        { courseTitle: { contains: "Database", mode: "insensitive" } },
        { category: { contains: "Database", mode: "insensitive" } },
        { title: { contains: "Oracle", mode: "insensitive" } },
        { courseTitle: { contains: "Oracle", mode: "insensitive" } }
      ]
    }
  });

  console.log("Matching Live Sessions:");
  sessions.forEach(s => {
    console.log(`- Session ID: ${s.id} | CourseId: ${s.courseId} | Title: ${s.title} | CourseTitle: ${s.courseTitle} | Category: ${s.category}`);
  });
}

inspectCerts()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
