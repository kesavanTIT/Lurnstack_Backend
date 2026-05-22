const cron = require('node-cron');
const prisma = require('../config/db');

// Runs every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  console.log('Running attendance finalization job...');
  try {
    const now = new Date();

    // 1. Finds ended occurrences not finalized
    const unfinalizedOccurrences = await prisma.sessionOccurrence.findMany({
      where: {
        endsAt: { lt: now },
        finalizedAt: null,
      },
    });

    for (const occurrence of unfinalizedOccurrences) {
      // 2. After occurrence ends, get enrolled students
      // We check SessionCard and Booking to find enrolled students
      const cards = await prisma.sessionCard.findMany({
        where: { sessionId: occurrence.sessionId },
        select: { studentId: true },
      });

      const bookings = await prisma.booking.findMany({
        where: { 
          sessionId: occurrence.sessionId,
          status: 'paid'
        },
        select: { studentId: true },
      });

      const enrolledStudentIds = new Set([
        ...cards.map(c => c.studentId),
        ...bookings.map(b => b.studentId)
      ]);

      // 3. Get attendance records for occurrence
      const existingAttendances = await prisma.studentAttendance.findMany({
        where: { occurrenceId: occurrence.id },
      });

      const attendedStudentIds = new Set(existingAttendances.map(a => a.studentId));

      // 4. For students without record, create absent record
      const absentRecords = [];
      for (const studentId of enrolledStudentIds) {
        if (!attendedStudentIds.has(studentId)) {
          absentRecords.push({
            courseId: occurrence.courseId || "",
            sessionId: occurrence.sessionId,
            occurrenceId: occurrence.id,
            occurrenceDate: occurrence.occurrenceDate,
            studentId: studentId,
            trainerId: occurrence.trainerId,
            status: "absent",
            source: "system_finalized",
            finalizedAt: now
          });
        }
      }

      if (absentRecords.length > 0) {
        await prisma.studentAttendance.createMany({
          data: absentRecords,
        });
      }

      // Mark all existing attendances for this occurrence as finalized
      await prisma.studentAttendance.updateMany({
        where: { occurrenceId: occurrence.id },
        data: { finalizedAt: now }
      });

      // 5. Mark occurrence as completed and Save finalizedAt
      await prisma.sessionOccurrence.update({
        where: { id: occurrence.id },
        data: {
          status: "completed",
          finalizedAt: now,
        },
      });
    }

    if (unfinalizedOccurrences.length > 0) {
      console.log(`Finalized attendance for ${unfinalizedOccurrences.length} occurrences.`);
    }

  } catch (error) {
    console.error('Error during attendance finalization job:', error);
  }
});
