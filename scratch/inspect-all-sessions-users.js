const prisma = require('../src/config/db');

async function inspectAll() {
  console.log("=== ALL LIVE SESSIONS ===");
  const sessions = await prisma.liveSession.findMany({});
  sessions.forEach(s => {
    console.log(`Session ID: ${s.id} | CourseId: ${s.courseId} | Title: ${s.title} | CourseTitle: ${s.courseTitle} | Category: ${s.category}`);
  });

  console.log("\n=== ALL CERTIFICATES IN DB ===");
  const certs = await prisma.certificate.findMany({
    include: { user: { select: { id: true, fullName: true, email: true } } }
  });
  certs.forEach(c => {
    console.log(`Cert DB ID: ${c.id} | User: ${c.user?.fullName} (${c.userId}) | CourseId: ${c.courseId} | CertId: ${c.certificateId} | StudentName: ${c.studentName} | StoredUrl: ${c.certificateUrl}`);
  });

  console.log("\n=== RECENT STUDENTS IN DB ===");
  const students = await prisma.user.findMany({
    where: { role: 'STUDENT' },
    select: { id: true, fullName: true, email: true }
  });
  console.log(JSON.stringify(students, null, 2));
}

inspectAll()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
