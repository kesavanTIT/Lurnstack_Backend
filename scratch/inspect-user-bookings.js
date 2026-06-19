require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function inspect() {
  console.log('=== Database Diagnostic ===\n');

  // 1. Get all students / users
  const users = await prisma.user.findMany({
    select: { id: true, fullName: true, email: true, role: true }
  });
  console.log('Users in DB:');
  console.log(users);
  console.log('\n----------------------------------------\n');

  // 2. Get all live sessions
  const sessions = await prisma.liveSession.findMany({
    select: {
      id: true,
      courseId: true,
      title: true,
      courseTitle: true,
      pricingState: true,
      priceInPaise: true,
      publishState: true,
      status: true
    }
  });
  console.log('Live Sessions in DB:');
  console.log(sessions);
  console.log('\n----------------------------------------\n');

  // 3. Get all bookings
  const bookings = await prisma.booking.findMany();
  console.log('Bookings in DB:');
  console.log(bookings);
  console.log('\n----------------------------------------\n');

  // 4. Get all student attendance
  const attendances = await prisma.studentAttendance.findMany({
    select: {
      id: true,
      studentId: true,
      courseId: true,
      sessionId: true,
      status: true
    }
  });
  console.log('Student Attendances in DB:');
  console.log(attendances);
  console.log('\n----------------------------------------\n');
}

inspect()
  .catch(err => console.error(err))
  .finally(() => prisma.$disconnect());
