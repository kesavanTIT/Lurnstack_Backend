const prisma = require('../src/config/db');

async function checkToday() {
  const targetDate = new Date('2026-07-13T00:00:00Z');

  console.log('Querying today\'s Attendance records (July 13)...');
  const records = await prisma.attendance.findMany({
    where: {
      occurrenceDate: targetDate
    },
    include: {
      student: { select: { fullName: true, email: true } },
      session: { select: { title: true, id: true } },
      events: true
    }
  });

  console.log(`Found ${records.length} attendance records:`);
  records.forEach(r => {
    console.log(`\n- Student: ${r.student.fullName} (${r.student.email})`);
    console.log(`  Session: "${r.session.title}" (ID: ${r.session.id})`);
    console.log(`  status: ${r.status}`);
    console.log(`  isJoined: ${r.isJoined}`);
    console.log(`  joinCount: ${r.joinCount}`);
    console.log(`  totalDurationSeconds: ${r.totalDurationSeconds}`);
    console.log(`  Events count: ${r.events.length}`);
    r.events.forEach(e => {
      console.log(`    * Event ID: ${e.id} | joinedAt: ${e.joinedAt} | leftAt: ${e.leftAt} | durationSeconds: ${e.durationSeconds} | updatedAt: ${e.updatedAt}`);
    });
  });
}

checkToday().catch(console.error);
