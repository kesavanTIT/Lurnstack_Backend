const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function removeMockData() {
  console.log("🧹 Starting Mock Data Cleanup...");

  const mockCourseIds = ["C-REACT-01", "C-PY-01", "C-PY-260505"];

  try {
    // 1. Delete generated mock certificates
    const deletedCerts = await prisma.certificate.deleteMany({
      where: {
        courseId: { in: mockCourseIds }
      }
    });
    console.log(`✅ Deleted ${deletedCerts.count} mock certificates`);

    // 2. Delete mock attendances
    const deletedAttendances = await prisma.studentAttendance.deleteMany({
      where: {
        courseId: { in: mockCourseIds }
      }
    });
    console.log(`✅ Deleted ${deletedAttendances.count} mock attendance records`);

    // 3. Delete mock occurrences
    const deletedOccurrences = await prisma.sessionOccurrence.deleteMany({
      where: {
        courseId: { in: mockCourseIds }
      }
    });
    console.log(`✅ Deleted ${deletedOccurrences.count} mock session occurrences`);

    // 4. Delete mock courses (LiveSessions)
    const deletedCourses = await prisma.liveSession.deleteMany({
      where: {
        courseId: { in: mockCourseIds }
      }
    });
    console.log(`✅ Deleted ${deletedCourses.count} mock courses`);

    // 5. Delete the mock users
    const mockEmails = ["student_cert@lurnstack.com", "trainer_cert@lurnstack.com", "student_mock@lurnstack.com"];
    const deletedUsers = await prisma.user.deleteMany({
      where: {
        email: { in: mockEmails }
      }
    });
    console.log(`✅ Deleted ${deletedUsers.count} mock users`);

    console.log("\n🎉 Mock data cleanup complete!");

  } catch (error) {
    console.error("❌ Error removing mock data:", error);
  } finally {
    await prisma.$disconnect();
  }
}

removeMockData();
