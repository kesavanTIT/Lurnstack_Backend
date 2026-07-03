const prisma = require("../config/db");
const { getDurationSeconds } = require("../utils/attendanceCalculator");
const ACTIVE_BOOKING_STATUSES = ["paid", "joined", "completed"];
const PRESENT_STATUSES = ["present", "joined", "completed"];
const ATTENDANCE_THRESHOLD_RATIO = 0.3;

const normalizeStatus = (status) => {
  if (!status) return "pending";
  if (PRESENT_STATUSES.includes(status)) return "present";
  if (status === "late") return "late";
  if (status === "absent") return "absent";
  return status;
};

const getDayRange = (dateInput) => {
  if (!dateInput) return null;
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return null;

  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);

  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);

  return { start, end };
};

const getDateKey = (date) => {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
};

const getRequiredSeconds = (occurrence) => {
  if (!occurrence?.startsAt || !occurrence?.endsAt) return 0;
  const durationSeconds = Math.max(
    60,
    Math.floor((new Date(occurrence.endsAt) - new Date(occurrence.startsAt)) / 1000)
  );
  return Math.ceil(durationSeconds * ATTENDANCE_THRESHOLD_RATIO);
};

const isOccurrenceEnded = (occurrence, now = new Date()) => {
  if (!occurrence) return false;
  return Boolean(
    occurrence.finalizedAt ||
      occurrence.status === "completed" ||
      (occurrence.endsAt && new Date(occurrence.endsAt) < now)
  );
};

const resolveFinalStatus = ({ studentAttendance, attendance, occurrence }) => {
  const sourceStatus = studentAttendance?.status || attendance?.status || "pending";
  let status = normalizeStatus(sourceStatus);

  if (studentAttendance?.source === "admin_manual") {
    return status;
  }

  if (!isOccurrenceEnded(occurrence)) {
    return status;
  }

  const requiredSeconds = getRequiredSeconds(occurrence);
  const durationSeconds = getDurationSeconds(attendance, occurrence);
  const joined = Boolean(studentAttendance || attendance);

  if (joined && requiredSeconds > 0) {
    if (durationSeconds >= requiredSeconds) {
      return "present";
    } else if (durationSeconds > 0 && durationSeconds < requiredSeconds) {
      return "absent";
    }
  }

  return status;
};

const mergeStudent = (map, student) => {
  if (!student || !student.id) return;
  if (!map.has(student.id)) {
    map.set(student.id, {
      id: student.id,
      fullName: student.fullName || "Unknown",
      email: student.email || "N/A",
    });
  }
};

const getEnrolledStudentsForSession = async (session) => {
  const studentMap = new Map();

  const [sessionBookings, billingBookings, cards] = await Promise.all([
    prisma.sessionBooking.findMany({
      where: { sessionId: session.id },
      include: { student: { select: { id: true, fullName: true, email: true } } },
    }),
    prisma.booking.findMany({
      where: {
        OR: [
          { sessionId: session.id, status: { in: ACTIVE_BOOKING_STATUSES } },
          session.courseId
            ? {
                courseId: session.courseId,
                accessScope: "course",
                status: { in: ACTIVE_BOOKING_STATUSES },
              }
            : null,
        ].filter(Boolean),
      },
      include: { student: { select: { id: true, fullName: true, email: true } } },
    }),
    prisma.sessionCard.findMany({
      where: { sessionId: session.id },
      include: { student: { select: { id: true, fullName: true, email: true } } },
    }),
  ]);

  sessionBookings.forEach((booking) => mergeStudent(studentMap, booking.student));
  billingBookings.forEach((booking) => mergeStudent(studentMap, booking.student));
  cards.forEach((card) => mergeStudent(studentMap, card.student));

  return Array.from(studentMap.values());
};

const getOccurrenceForSessionDate = async (sessionId, date) => {
  const range = getDayRange(date);
  if (!range) return null;

  return prisma.sessionOccurrence.findFirst({
    where: {
      sessionId,
      occurrenceDate: {
        gte: range.start,
        lte: range.end,
      },
    },
  });
};

const buildRosterForOccurrence = async ({ session, occurrence, date }) => {
  const range = getDayRange(date || occurrence?.occurrenceDate);
  if (!range) {
    return {
      students: [],
      presentCount: 0,
      lateCount: 0,
      absentCount: 0,
      attendedCount: 0,
      totalStudents: 0,
      attendancePercentage: 0,
    };
  }

  const [studentAttendances, attendances, enrolledStudents] = await Promise.all([
    occurrence
      ? prisma.studentAttendance.findMany({
          where: { occurrenceId: occurrence.id },
          include: { student: { select: { id: true, fullName: true, email: true } } },
        })
      : prisma.studentAttendance.findMany({
          where: {
            sessionId: session.id,
            occurrenceDate: { gte: range.start, lte: range.end },
          },
          include: { student: { select: { id: true, fullName: true, email: true } } },
        }),
    prisma.attendance.findMany({
      where: {
        sessionId: session.id,
        occurrenceDate: { gte: range.start, lte: range.end },
      },
      include: {
        student: { select: { id: true, fullName: true, email: true } },
        events: { orderBy: { joinedAt: "asc" } },
      },
    }),
    getEnrolledStudentsForSession(session),
  ]);

  const rosterMap = new Map();

  const ensureRosterRow = (student) => {
    if (!student?.id) return null;
    if (!rosterMap.has(student.id)) {
      rosterMap.set(student.id, {
        attendanceId: null,
        studentAttendanceId: null,
        studentId: student.id,
        fullName: student.fullName || "Unknown",
        email: student.email || "N/A",
        status: "pending",
        occurrenceDate: occurrence?.occurrenceDate || range.start,
        firstJoinedAt: null,
        lastJoinedAt: null,
        joinCount: 0,
        totalDurationSeconds: 0,
        source: null,
      });
    }
    return rosterMap.get(student.id);
  };

  enrolledStudents.forEach(ensureRosterRow);

  const attendanceByStudent = new Map();
  attendances.forEach((attendance) => {
    attendanceByStudent.set(attendance.studentId, attendance);
    const row = ensureRosterRow(attendance.student);
    if (!row) return;

    row.attendanceId = attendance.id;
    row.occurrenceDate = attendance.occurrenceDate;
    row.firstJoinedAt = attendance.firstJoinedAt || attendance.joinedAt || null;
    row.lastJoinedAt = attendance.lastJoinedAt || attendance.joinedAt || null;
    row.joinCount = attendance.joinCount || 0;
    row.totalDurationSeconds = getDurationSeconds(attendance, occurrence);
  });

  studentAttendances.forEach((studentAttendance) => {
    const row = ensureRosterRow(studentAttendance.student);
    if (!row) return;

    row.studentAttendanceId = studentAttendance.id;
    row.occurrenceDate = studentAttendance.occurrenceDate;
    row.firstJoinedAt = studentAttendance.firstJoinedAt || row.firstJoinedAt;
    row.lastJoinedAt = studentAttendance.lastJoinedAt || row.lastJoinedAt;
    row.joinCount = Math.max(row.joinCount || 0, studentAttendance.joinCount || 0);
    row.source = studentAttendance.source || null;
  });

  for (const row of rosterMap.values()) {
    const studentAttendance = studentAttendances.find((item) => item.studentId === row.studentId);
    const attendance = attendanceByStudent.get(row.studentId);
    row.status = resolveFinalStatus({ studentAttendance, attendance, occurrence });

    if (isOccurrenceEnded(occurrence) && !studentAttendance && !attendance) {
      row.status = "absent";
    }
  }

  const students = Array.from(rosterMap.values()).sort((a, b) =>
    String(a.fullName).localeCompare(String(b.fullName))
  );

  const presentCount = students.filter((student) => student.status === "present").length;
  const lateCount = students.filter((student) => student.status === "late").length;
  const absentCount = students.filter((student) => student.status === "absent").length;
  const attendedCount = presentCount + lateCount;
  const totalStudents = students.length;
  const attendancePercentage =
    totalStudents > 0 ? parseFloat(((attendedCount / totalStudents) * 100).toFixed(2)) : 0;

  return {
    students,
    presentCount,
    lateCount,
    absentCount,
    attendedCount,
    totalStudents,
    attendancePercentage,
  };
};

const countRosterStatuses = (students) => ({
  presentCount: students.filter((student) => student.status === "present").length,
  lateCount: students.filter((student) => student.status === "late").length,
  absentCount: students.filter((student) => student.status === "absent").length,
});

const syncManualAttendanceStatus = async ({ attendanceId, status }) => {
  const normalized = normalizeStatus(status);

  return prisma.$transaction(async (tx) => {
    let attendance = await tx.attendance.findUnique({
      where: { id: attendanceId },
      include: { session: true },
    });

    let studentAttendance = await tx.studentAttendance.findUnique({
      where: { id: attendanceId },
      include: { session: true, occurrence: true },
    });

    if (!attendance && !studentAttendance) {
      throw new Error("Attendance record not found.");
    }

    if (attendance) {
      attendance = await tx.attendance.update({
        where: { id: attendance.id },
        data: { status: normalized, updatedAt: new Date() },
        include: { session: true },
      });
    }

    if (!studentAttendance && attendance) {
      const occurrence = await tx.sessionOccurrence.findFirst({
        where: {
          sessionId: attendance.sessionId,
          occurrenceDate: attendance.occurrenceDate,
        },
      });

      if (occurrence) {
        studentAttendance = await tx.studentAttendance.findUnique({
          where: {
            occurrenceId_studentId: {
              occurrenceId: occurrence.id,
              studentId: attendance.studentId,
            },
          },
        });

        if (studentAttendance) {
          studentAttendance = await tx.studentAttendance.update({
            where: { id: studentAttendance.id },
            data: { status: normalized, source: "admin_manual", finalizedAt: new Date() },
          });
        } else {
          studentAttendance = await tx.studentAttendance.create({
            data: {
              courseId: occurrence.courseId || attendance.session?.courseId || attendance.sessionId || "default",
              sessionId: attendance.sessionId,
              occurrenceId: occurrence.id,
              occurrenceDate: occurrence.occurrenceDate,
              studentId: attendance.studentId,
              trainerId: occurrence.trainerId,
              firstJoinedAt: attendance.firstJoinedAt || new Date(),
              lastJoinedAt: attendance.lastJoinedAt || new Date(),
              joinCount: attendance.joinCount || 0,
              status: normalized,
              source: "admin_manual",
              finalizedAt: new Date(),
            },
          });
        }
      }
    }

    if (studentAttendance) {
      studentAttendance = await tx.studentAttendance.update({
        where: { id: studentAttendance.id },
        data: { status: normalized, source: "admin_manual", finalizedAt: new Date() },
        include: { session: true, occurrence: true },
      });

      if (!attendance) {
        attendance = await tx.attendance.findFirst({
          where: {
            sessionId: studentAttendance.sessionId,
            studentId: studentAttendance.studentId,
            occurrenceDate: studentAttendance.occurrenceDate,
          },
        });

        if (attendance) {
          attendance = await tx.attendance.update({
            where: { id: attendance.id },
            data: { status: normalized, updatedAt: new Date() },
          });
        }
      }
    }

    return { attendance, studentAttendance };
  });
};

module.exports = {
  normalizeStatus,
  getDayRange,
  getDateKey,
  getDurationSeconds,
  getRequiredSeconds,
  isOccurrenceEnded,
  resolveFinalStatus,
  getEnrolledStudentsForSession,
  getOccurrenceForSessionDate,
  buildRosterForOccurrence,
  countRosterStatuses,
  syncManualAttendanceStatus,
};
