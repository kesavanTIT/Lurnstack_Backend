/**
 * scripts/diagnose-july11.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Diagnostic script to check database records for specific students on July 11.
 * ─────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const prisma = require('../src/config/db');

async function main() {
  const sessionId = '0404ab9d-2b0f-4338-ad6c-e43cfe78904c';
  const targetDate = new Date('2026-07-11T00:00:00Z');
  
  const emails = [
    'iceiswarya471@gmail.com',  // ISWARYA K (Present 60m joinCount 0)
    'toniprasad445@gmail.com',  // Dhinesh prasad.S (Absent 0m joinCount 0)
  ];

  console.log(`🔍 Querying Attendance and StudentAttendance for July 11, 2026...`);

  for (const email of emails) {
    console.log(`\n--------------------------------------------`);
    console.log(`👤 Student Email: ${email}`);
    
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.log(`❌ User not found!`);
      continue;
    }
    console.log(`User ID: ${user.id} | Name: ${user.fullName}`);

    // Query Attendance record
    const attendance = await prisma.attendance.findFirst({
      where: {
        studentId: user.id,
        sessionId,
        occurrenceDate: targetDate
      },
      include: { events: true }
    });

    if (attendance) {
      console.log(`\n--- Main Attendance Record ---`);
      console.log(`ID: ${attendance.id}`);
      console.log(`status: ${attendance.status}`);
      console.log(`isJoined: ${attendance.isJoined}`);
      console.log(`joinCount: ${attendance.joinCount}`);
      console.log(`totalDurationSeconds: ${attendance.totalDurationSeconds}`);
      console.log(`joinedAt (default now): ${attendance.joinedAt}`);
      console.log(`firstJoinedAt: ${attendance.firstJoinedAt}`);
      console.log(`lastJoinedAt: ${attendance.lastJoinedAt}`);
      console.log(`Events count: ${attendance.events.length}`);
      if (attendance.events.length > 0) {
        attendance.events.forEach(e => {
          console.log(`  - Event joinedAt: ${e.joinedAt} | leftAt: ${e.leftAt} | durationSeconds: ${e.durationSeconds}`);
        });
      }
    } else {
      console.log(`❌ No Main Attendance record found!`);
    }

    // Query StudentAttendance record
    const studentAttendance = await prisma.studentAttendance.findFirst({
      where: {
        studentId: user.id,
        sessionId,
        occurrenceDate: targetDate
      }
    });

    if (studentAttendance) {
      console.log(`\n--- StudentAttendance Record ---`);
      console.log(`ID: ${studentAttendance.id}`);
      console.log(`status: ${studentAttendance.status}`);
      console.log(`firstJoinedAt: ${studentAttendance.firstJoinedAt}`);
      console.log(`lastJoinedAt: ${studentAttendance.lastJoinedAt}`);
      console.log(`joinCount: ${studentAttendance.joinCount}`);
      console.log(`source: ${studentAttendance.source}`);
      console.log(`finalizedAt: ${studentAttendance.finalizedAt}`);
    } else {
      console.log(`❌ No StudentAttendance record found!`);
    }
  }
}

main().catch(err => {
  console.error('❌ Diagnostic failed:', err);
}).finally(() => {
  prisma.$disconnect();
});
