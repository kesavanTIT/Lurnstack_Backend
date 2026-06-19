require('dotenv').config();
const prisma = require('../src/config/db');

async function main() {
  console.log('=== Category Records ===');
  const categories = await prisma.category.findMany();
  console.log(categories.map(c => ({ id: c.id, name: c.name })));

  console.log('\n=== LiveSessions ===');
  const sessions = await prisma.liveSession.findMany({
    select: { id: true, courseId: true, title: true, pricingState: true, priceInPaise: true }
  });
  console.log(sessions);

  console.log('\n=== Users (First 5 Students) ===');
  const students = await prisma.user.findMany({
    where: { role: 'STUDENT' },
    take: 5,
    select: { id: true, fullName: true, email: true }
  });
  console.log(students);

  console.log('\n=== Booking Status Counts ===');
  const bookingCounts = await prisma.booking.groupBy({
    by: ['status'],
    _count: { id: true }
  });
  console.log(bookingCounts);

  console.log('\n=== Student Attendance Counts ===');
  const attendanceCounts = await prisma.studentAttendance.groupBy({
    by: ['status'],
    _count: { id: true }
  });
  console.log(attendanceCounts);
}

main().catch(console.error).finally(() => prisma.$disconnect());
