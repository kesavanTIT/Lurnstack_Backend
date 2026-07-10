const prisma = require('./src/config/db');

async function main() {
  console.log('=== Checking Local DB Record Counts ===');
  const userCount = await prisma.user.count();
  const sessionCount = await prisma.liveSession.count();
  const occurrenceCount = await prisma.sessionOccurrence.count();
  const attendanceCount = await prisma.attendance.count();
  const studentAttendanceCount = await prisma.studentAttendance.count();

  console.log(`Users: ${userCount}`);
  console.log(`Sessions: ${sessionCount}`);
  console.log(`Occurrences: ${occurrenceCount}`);
  console.log(`Attendance Records (legacy): ${attendanceCount}`);
  console.log(`Student Attendance (new): ${studentAttendanceCount}`);
}

main().catch(err => {
  console.error('ERROR:', err.message);
}).finally(() => {
  prisma.$disconnect();
});
