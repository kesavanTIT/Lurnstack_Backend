const prisma = require('../src/config/db');

async function main() {
  const startOfToday = new Date('2026-07-08T00:00:00Z');
  const endOfToday = new Date('2026-07-08T23:59:59Z');

  console.log('=== SessionOccurrences for 2026-07-08 ===');
  const occurrences = await prisma.sessionOccurrence.findMany({
    where: {
      occurrenceDate: {
        gte: startOfToday,
        lte: endOfToday
      }
    },
    include: {
      session: {
        select: {
          id: true,
          title: true,
          status: true
        }
      }
    }
  });
  console.log(JSON.stringify(occurrences, null, 2));

  console.log('\n=== StudentAttendances for 2026-07-08 ===');
  const studentAttendances = await prisma.studentAttendance.findMany({
    where: {
      occurrenceDate: {
        gte: startOfToday,
        lte: endOfToday
      }
    },
    include: {
      student: { select: { id: true, fullName: true, email: true } }
    }
  });
  console.log(JSON.stringify(studentAttendances, null, 2));

  console.log('\n=== Attendance for 2026-07-08 ===');
  const attendances = await prisma.attendance.findMany({
    where: {
      occurrenceDate: {
        gte: startOfToday,
        lte: endOfToday
      }
    },
    include: {
      student: { select: { id: true, fullName: true, email: true } }
    }
  });
  console.log(JSON.stringify(attendances, null, 2));

  console.log('\n=== Total Students count ===');
  const studentCount = await prisma.user.count({ where: { role: 'STUDENT' } });
  console.log('Total students in DB:', studentCount);
}

main()
  .catch(err => console.error(err))
  .finally(() => prisma.$disconnect());
