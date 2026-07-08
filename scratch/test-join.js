const prisma = require('../src/config/db');

// Helpers from studentController
const getKolkataDateString = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
};

const getKolkataDateTime = (dateStr, timeStr) => {
  return new Date(`${dateStr}T${timeStr}:00+05:30`);
};

async function main() {
  console.log('=== Starting Recurring Join Simulation ===');

  // 1. Create Trainer
  const trainer = await prisma.user.upsert({
    where: { email: 'trainer-test@lurnstack.com' },
    update: {},
    create: {
      fullName: 'Test Trainer',
      email: 'trainer-test@lurnstack.com',
      password: 'password123',
      role: 'TRAINER',
    }
  });

  // 2. Create Student
  const student = await prisma.user.upsert({
    where: { email: 'student-test@lurnstack.com' },
    update: {},
    create: {
      fullName: 'Test Student',
      email: 'student-test@lurnstack.com',
      password: 'password123',
      role: 'STUDENT',
    }
  });

  // 3. Create Live Session (RECURRING, scheduledDate in the past: 2026-07-01)
  const session = await prisma.liveSession.create({
    data: {
      title: 'Gen AI Class Test Recurring',
      trainerId: trainer.id,
      pricingState: 'FREE',
      publishState: 'PUBLISHED',
      status: 'active',
      startTime: '10:00',
      endTime: '11:00',
      isRecurring: true,
      scheduledDate: '2026-07-01', // Past start date
    }
  });
  console.log('Session ID:', session.id);
  console.log('Session isRecurring:', session.isRecurring);
  console.log('Session scheduledDate (first day):', session.scheduledDate);

  // 4. Run the fixed join date resolution logic
  const now = new Date();
  const studentId = student.id;
  const resolvedDateInput = null; // simulate no date input from frontend

  // Resolved Date logic matching the updated controller
  const parseToKolkataDateString = (input) => {
    if (!input) return null;
    return String(input).slice(0, 10);
  };
  
  const targetDateStr = parseToKolkataDateString(resolvedDateInput) || 
    (session.isRecurring ? getKolkataDateString(now) : (session.scheduledDate || getKolkataDateString(now)));
  
  console.log('Resolved targetDateStr:', targetDateStr);
  
  const targetDate = new Date(targetDateStr);
  targetDate.setUTCHours(0, 0, 0, 0);

  const startKolkataTime = session.startTime || "00:00";
  const endKolkataTime = session.endTime || "23:59";
  const scheduledAtTime = getKolkataDateTime(targetDateStr, startKolkataTime);
  const endsAtTime = getKolkataDateTime(targetDateStr, endKolkataTime);

  // 1. Find or create SessionOccurrence
  let occurrence = await prisma.sessionOccurrence.findUnique({
    where: {
      sessionId_occurrenceDate: {
        sessionId: session.id,
        occurrenceDate: targetDate
      }
    }
  });

  if (!occurrence) {
    occurrence = await prisma.sessionOccurrence.create({
      data: {
        courseId: session.courseId || session.id || "default",
        sessionId: session.id,
        trainerId: session.trainerId,
        occurrenceDate: targetDate,
        startsAt: scheduledAtTime,
        endsAt: endsAtTime,
        status: "scheduled"
      }
    });
  }
  console.log('Occurrence occurrenceDate in DB:', occurrence.occurrenceDate.toISOString());

  // 2. Create or update StudentAttendance
  let studentAttendance = await prisma.studentAttendance.create({
    data: {
      courseId: session.courseId || session.id || "default",
      sessionId: session.id,
      occurrenceId: occurrence.id,
      occurrenceDate: targetDate,
      studentId: studentId,
      trainerId: session.trainerId,
      firstJoinedAt: now,
      lastJoinedAt: now,
      joinCount: 1,
      status: 'pending',
      source: "join_button"
    }
  });
  console.log('StudentAttendance occurrenceDate in DB:', studentAttendance.occurrenceDate.toISOString());

  // 3. Create or update Attendance
  let attendance = await prisma.attendance.create({
    data: {
      studentId,
      sessionId: session.id,
      occurrenceDate: targetDate,
      status: 'pending',
      firstJoinedAt: now,
      lastJoinedAt: now,
      joinCount: 1,
      totalDurationSeconds: 0,
      isJoined: true
    }
  });
  console.log('Attendance occurrenceDate in DB:', attendance.occurrenceDate.toISOString());

  console.log('=== Checking Roster Calculation for today (2026-07-08) ===');
  const { buildRosterForOccurrence } = require('../src/services/adminAttendance.service');
  const rosterToday = await buildRosterForOccurrence({ session, occurrence, date: '2026-07-08' });
  console.log('Roster result for today:', JSON.stringify(rosterToday, null, 2));

  // Clean up
  console.log('=== Cleaning up test data ===');
  await prisma.attendanceEvent.deleteMany({ where: { sessionId: session.id } });
  await prisma.attendance.deleteMany({ where: { sessionId: session.id } });
  await prisma.studentAttendance.deleteMany({ where: { sessionId: session.id } });
  await prisma.sessionOccurrence.deleteMany({ where: { sessionId: session.id } });
  await prisma.liveSession.delete({ where: { id: session.id } });
  console.log('Cleanup complete!');
}

main()
  .catch(err => console.error(err))
  .finally(() => prisma.$disconnect());
