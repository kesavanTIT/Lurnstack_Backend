require('dotenv').config();
const prisma = require('../src/config/db');

async function main() {
  // Find students with bookings or attendance
  const students = await prisma.user.findMany({
    where: { role: 'STUDENT' },
    select: { id: true, fullName: true, email: true }
  });

  for (const s of students) {
    const userId = s.id;
    console.log(`\n================ STUDENT: ${s.fullName} (${s.email}, ID: ${userId}) ================`);

    // Fetch attendances
    const attendances = await prisma.studentAttendance.findMany({
      where: { studentId: userId },
      select: { 
        id: true,
        courseId: true, 
        sessionId: true,
        session: { select: { id: true, title: true, courseTitle: true, courseId: true } },
        trainer: { select: { fullName: true } },
        occurrenceDate: true
      },
      orderBy: { occurrenceDate: "desc" }
    });

    console.log(`\n--- ATTENDANCES (${attendances.length} found) ---`);
    attendances.forEach(a => {
      console.log(`Attendance ID: ${a.id}`);
      console.log(`  courseId (from attr): "${a.courseId}"`);
      console.log(`  sessionId: "${a.sessionId}"`);
      console.log(`  session.courseId: "${a.session?.courseId}"`);
      console.log(`  session.courseTitle: "${a.session?.courseTitle}"`);
      console.log(`  session.title: "${a.session?.title}"`);
    });

    // Fetch bookings
    const bookings = await prisma.booking.findMany({
      where: {
        studentId: userId,
        status: { in: ["paid", "completed", "joined"] }
      },
      include: {
        session: {
          select: {
            id: true,
            courseId: true,
            title: true,
            courseTitle: true,
            trainer: { select: { fullName: true } }
          }
        }
      }
    });

    console.log(`\n--- BOOKINGS (${bookings.length} found) ---`);
    bookings.forEach(b => {
      console.log(`Booking ID: ${b.id}`);
      console.log(`  courseId (from attr): "${b.courseId}"`);
      console.log(`  sessionId: "${b.sessionId}"`);
      console.log(`  session.courseId: "${b.session?.courseId}"`);
      console.log(`  session.courseTitle: "${b.session?.courseTitle}"`);
      console.log(`  session.title: "${b.session?.title}"`);
    });

    // Let's run the courseMap logic from certificateController.js
    const courseMap = new Map();
    
    // Add records from attendance
    for (const a of attendances) {
      const cid = a.session?.courseId || a.courseId;
      if (cid && !courseMap.has(cid)) {
        courseMap.set(cid, {
          source: 'attendance',
          courseId: cid,
          title: a.session?.courseTitle || a.session?.title || "Unknown Course",
          trainerName: a.trainer?.fullName || "Unknown Trainer",
          completedAt: a.occurrenceDate ? a.occurrenceDate.toISOString() : new Date().toISOString()
        });
      }
    }

    // Add records from bookings
    for (const b of bookings) {
      const cid = b.session?.courseId || b.courseId || b.sessionId;
      if (cid && !courseMap.has(cid)) {
        courseMap.set(cid, {
          source: 'booking',
          courseId: cid,
          title: b.session?.courseTitle || b.session?.title || "Unknown Course",
          trainerName: b.session?.trainer?.fullName || "Unknown Trainer",
          completedAt: b.createdAt ? b.createdAt.toISOString() : new Date().toISOString()
        });
      }
    }

    console.log(`\n--- RESULTING COURSE MAP ---`);
    console.log(Array.from(courseMap.entries()));

    // Let's also check eligibility for each course
    for (const [cid, details] of courseMap.entries()) {
      const eligibility = await checkEligibilityMock(userId, cid);
      console.log(`Eligibility for "${cid}":`, eligibility);
    }
  }
}

// Minimal checkEligibility logic based on certificate.service.js
async function checkEligibilityMock(userId, courseId) {
  const settings = await prisma.certificateSettings.findFirst({
    orderBy: { updatedAt: "desc" },
  }) || { freeThreshold: 75, certificatePricePaise: 29900 };

  const session = await prisma.liveSession.findFirst({
    where: {
      OR: [
        { courseId: courseId },
        { id: courseId }
      ]
    },
    include: {
      trainer: { select: { fullName: true } },
    },
  });

  if (!session) return { status: 'SESSION_NOT_FOUND' };

  // Calculate attendance
  const occurrences = await prisma.sessionOccurrence.findMany({
    where: {
      OR: [
        { courseId: courseId },
        { sessionId: session.id }
      ]
    }
  });

  const attendances = await prisma.studentAttendance.findMany({
    where: {
      studentId: userId,
      OR: [
        { courseId: courseId },
        { sessionId: session.id }
      ],
      status: "present"
    }
  });

  const total = occurrences.length;
  const attended = attendances.length;
  const pct = total > 0 ? Math.round((attended / total) * 100) : 0;

  return {
    courseId,
    courseTitle: session.courseTitle || session.title,
    sessionStatus: session.status,
    totalOccurrences: total,
    attendedCount: attended,
    pct,
    pricingState: session.pricingState
  };
}

main().catch(console.error).finally(() => prisma.$disconnect());
