const prisma = require('../src/config/db');

async function checkJuly11() {
  const sessionId = '0404ab9d-2b0f-4338-ad6c-e43cfe78904c';
  const targetDate = new Date('2026-07-11T00:00:00Z');

  console.log('Querying Attendance for July 11...');
  const records = await prisma.attendance.findMany({
    where: {
      sessionId,
      occurrenceDate: targetDate
    },
    include: {
      student: { select: { fullName: true, email: true } },
      events: true
    }
  });

  console.log(`Found ${records.length} attendance records in local DB:`);
  records.forEach(r => {
    console.log(`- ${r.student.fullName} (${r.student.email}):`);
    console.log(`  status: ${r.status}`);
    console.log(`  firstJoinedAt: ${r.firstJoinedAt}`);
    console.log(`  lastJoinedAt: ${r.lastJoinedAt}`);
    console.log(`  joinCount: ${r.joinCount}`);
    console.log(`  totalDurationSeconds: ${r.totalDurationSeconds}`);
    console.log(`  Events count: ${r.events.length}`);
  });
}

checkJuly11().catch(console.error);
