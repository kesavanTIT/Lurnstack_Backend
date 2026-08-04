const cron = require('node-cron');
const prisma = require('../config/db');
const { getDurationSeconds } = require('../utils/attendanceCalculator');

const syncLegacyAttendance = async ({ occurrence, studentId, status, firstJoinedAt, lastJoinedAt, joinCount = 0, totalDurationSeconds = 0 }) => {
  const existing = await prisma.attendance.findFirst({
    where: {
      studentId,
      sessionId: occurrence.sessionId,
      occurrenceDate: occurrence.occurrenceDate,
    },
  });

  if (existing) {
    return prisma.attendance.update({
      where: { id: existing.id },
      data: {
        status,
        firstJoinedAt: firstJoinedAt || existing.firstJoinedAt,
        lastJoinedAt: lastJoinedAt || existing.lastJoinedAt,
        joinCount: Math.max(existing.joinCount || 0, joinCount || 0),
        totalDurationSeconds: Math.max(existing.totalDurationSeconds || 0, totalDurationSeconds || 0),
        isJoined: status !== "absent",
      },
    });
  }

  return prisma.attendance.create({
    data: {
      studentId,
      sessionId: occurrence.sessionId,
      occurrenceDate: occurrence.occurrenceDate,
      status,
      firstJoinedAt: firstJoinedAt || occurrence.endsAt || new Date(),
      lastJoinedAt: lastJoinedAt || occurrence.endsAt || new Date(),
      joinCount,
      totalDurationSeconds,
      isJoined: status !== "absent",
    },
  });
};

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
      include: {
        session: true,
      },
    });

    for (const occurrence of unfinalizedOccurrences) {
      // 2. After occurrence ends, get enrolled students
      const session = occurrence.session;
      const isTIT = session && (session.sectionType === "TIT" || session.sessionType === "TIT" || session.source === "admin_tit_classes");

      const [cards, bookings, titStudents] = await Promise.all([
        prisma.sessionCard.findMany({
          where: { sessionId: occurrence.sessionId },
          select: { studentId: true },
        }),
        prisma.booking.findMany({
          where: { 
            sessionId: occurrence.sessionId,
            status: 'paid'
          },
          select: { studentId: true },
        }),
        isTIT
          ? prisma.user.findMany({
              where: { role: "STUDENT" },
              select: { id: true },
            })
          : Promise.resolve([]),
      ]);

      const enrolledStudentIds = new Set([
        ...cards.map(c => c.studentId),
        ...bookings.map(b => b.studentId),
        ...titStudents.map(s => s.id),
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

        for (const record of absentRecords) {
          await syncLegacyAttendance({
            occurrence,
            studentId: record.studentId,
            status: "absent",
            joinCount: 0,
            totalDurationSeconds: 0,
          });
        }
      }

      // ENFORCE 25% RULE FOR STUDENTS WHO JOINED
      const sessionDurationMins = (occurrence.startsAt && occurrence.endsAt)
        ? Math.max(1, Math.round((new Date(occurrence.endsAt) - new Date(occurrence.startsAt)) / 60000))
        : 60;
      const requiredSeconds = Math.ceil(sessionDurationMins * 60 * 0.25);

      // Fetch actual duration from main Attendance model
      const actualAttendances = await prisma.attendance.findMany({
        where: {
          sessionId: occurrence.sessionId,
          occurrenceDate: occurrence.occurrenceDate,
        }
      });

      const actualAttMap = new Map(actualAttendances.map(a => {
        const totalSecs = getDurationSeconds(a, occurrence);
        return [a.studentId, { totalSecs, status: a.status }];
      }));

      for (const sa of existingAttendances) {
        const actualInfo = actualAttMap.get(sa.studentId);
        let totalSecs = actualInfo?.totalSecs || 0;
        
        // If mobile user, auto-estimate duration from firstJoinedAt to endsAt
        const isMobile = sa.source === "mobile_join";
        if (isMobile && occurrence.endsAt) {
          const firstJoined = sa.firstJoinedAt;
          if (firstJoined) {
            const ends = new Date(occurrence.endsAt);
            const joinedDate = new Date(firstJoined);
            const estimatedSeconds = Math.max(0, Math.floor((ends.getTime() - joinedDate.getTime()) / 1000));
            if (estimatedSeconds > totalSecs) {
              totalSecs = estimatedSeconds;
            }
          }
        }

        let newStatus = sa.status;
        
        // If they didn't meet the 25% threshold, mark them as absent (even if they clicked join)
        if (totalSecs < requiredSeconds) {
          newStatus = "absent";
        } else if (newStatus === "joined" || newStatus === "pending") {
          const calculatedStatus = actualInfo?.status;
          if (calculatedStatus && ["present", "late"].includes(calculatedStatus)) {
            newStatus = calculatedStatus;
          } else {
            // Fallback calculation: check grace period
            const graceEndTime = occurrence.startsAt ? new Date(new Date(occurrence.startsAt).getTime() + 15 * 60 * 1000) : null;
            if (sa.firstJoinedAt && graceEndTime && new Date(sa.firstJoinedAt) <= graceEndTime) {
              newStatus = "present";
            } else {
              newStatus = "late";
            }
          }
        }

        await prisma.studentAttendance.update({
          where: { id: sa.id },
          data: {
            status: newStatus,
            finalizedAt: now
          }
        });

        await syncLegacyAttendance({
          occurrence,
          studentId: sa.studentId,
          status: newStatus,
          firstJoinedAt: sa.firstJoinedAt,
          lastJoinedAt: sa.lastJoinedAt,
          joinCount: sa.joinCount,
          totalDurationSeconds: totalSecs,
        });
      }

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
