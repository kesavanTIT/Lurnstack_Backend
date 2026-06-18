require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fix() {
  const attendances = await prisma.studentAttendance.findMany({
    include: {
      occurrence: true,
      student: true
    }
  });

  for (const sa of attendances) {
    if (sa.status === 'absent' && sa.joinCount > 0) {
      // Find actual duration
      const actualAtt = await prisma.attendance.findFirst({
        where: {
          studentId: sa.studentId,
          sessionId: sa.sessionId,
          occurrenceDate: sa.occurrenceDate
        }
      });

      if (actualAtt) {
        let totalSecs = actualAtt.totalDurationSeconds || 0;
        if (totalSecs === 0 && actualAtt.joinedAt) {
          const start = new Date(actualAtt.joinedAt).getTime();
          const end = sa.occurrence.endsAt ? new Date(sa.occurrence.endsAt).getTime() : start + 3600000;
          if (end > start) {
            totalSecs = Math.round((end - start) / 1000);
          }
        }

        const sessionDurationMins = (sa.occurrence.startsAt && sa.occurrence.endsAt)
          ? Math.max(1, Math.round((new Date(sa.occurrence.endsAt) - new Date(sa.occurrence.startsAt)) / 60000))
          : 60;
        const requiredSeconds = Math.ceil(sessionDurationMins * 60 * 0.30);

        if (totalSecs >= requiredSeconds) {
          console.log(`Updating ${sa.student.fullName} to present. Duration: ${totalSecs}s >= Required: ${requiredSeconds}s`);
          await prisma.studentAttendance.update({
            where: { id: sa.id },
            data: { status: 'present' }
          });
        }
      }
    }
  }
  console.log("Done");
}

fix().catch(console.error).finally(() => prisma.$disconnect());
