/**
 * scripts/inspect-generative-ai.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Inspects all attendance and events for today's Generative AI class (e62f844e-bbb9-4d6d-afa0-1426fc256397).
 * ─────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const prisma = require('../src/config/db');

async function main() {
  const sessionId = 'e62f844e-bbb9-4d6d-afa0-1426fc256397';
  const targetDate = new Date('2026-07-13T00:00:00Z');

  console.log(`🔍 Inspecting session: "${sessionId}" on ${targetDate.toISOString().slice(0, 10)}`);

  // Fetch occurrence
  const occurrence = await prisma.sessionOccurrence.findUnique({
    where: {
      sessionId_occurrenceDate: {
        sessionId,
        occurrenceDate: targetDate
      }
    }
  });

  if (occurrence) {
    console.log(`\n--- SessionOccurrence ---`);
    console.log(`ID: ${occurrence.id}`);
    console.log(`Status: ${occurrence.status}`);
    console.log(`startsAt: ${occurrence.startsAt}`);
    console.log(`endsAt: ${occurrence.endsAt}`);
    console.log(`finalizedAt: ${occurrence.finalizedAt}`);
  } else {
    console.log(`❌ No SessionOccurrence found for today!`);
  }

  // Fetch all Attendance records
  const attendances = await prisma.attendance.findMany({
    where: {
      sessionId,
      occurrenceDate: targetDate
    },
    include: {
      student: { select: { id: true, fullName: true, email: true } },
      events: true
    }
  });

  console.log(`\n--- Main Attendance Records (${attendances.length}) ---`);
  attendances.forEach(a => {
    console.log(`\n👤 Student: ${a.student.fullName} (${a.student.email}) [ID: ${a.studentId}]`);
    console.log(`   status: ${a.status} | isJoined: ${a.isJoined}`);
    console.log(`   joinCount: ${a.joinCount} | totalDurationSeconds: ${a.totalDurationSeconds}`);
    console.log(`   joinedAt: ${a.joinedAt} | firstJoinedAt: ${a.firstJoinedAt} | lastJoinedAt: ${a.lastJoinedAt}`);
    console.log(`   Events count: ${a.events.length}`);
    if (a.events.length > 0) {
      a.events.forEach(e => {
        console.log(`      * Event joinedAt: ${e.joinedAt} | leftAt: ${e.leftAt} | durationSeconds: ${e.durationSeconds} | updatedAt: ${e.updatedAt}`);
      });
    }
  });

  // Fetch all StudentAttendance records
  const studentAttendances = await prisma.studentAttendance.findMany({
    where: {
      sessionId,
      occurrenceDate: targetDate
    },
    include: {
      student: { select: { id: true, fullName: true, email: true } }
    }
  });

  console.log(`\n--- StudentAttendance Records (${studentAttendances.length}) ---`);
  studentAttendances.forEach(sa => {
    console.log(`👤 Student: ${sa.student.fullName} (${sa.student.email})`);
    console.log(`   status: ${sa.status} | joinCount: ${sa.joinCount} | source: ${sa.source}`);
    console.log(`   firstJoinedAt: ${sa.firstJoinedAt} | lastJoinedAt: ${sa.lastJoinedAt}`);
  });
}

main().catch(err => {
  console.error('❌ Inspection failed:', err);
}).finally(() => {
  prisma.$disconnect();
});
