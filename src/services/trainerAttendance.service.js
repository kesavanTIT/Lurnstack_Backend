"use strict";

const prisma = require("../config/db");

// ─── Constants ────────────────────────────────────────────────────────────────

const DURATION_THRESHOLD_MINS = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Formats a Date to "hh:mm AM/PM" string.
 * Times in DB represent actual display times stored as UTC —
 * no timezone conversion applied.
 * @param {Date|null} date
 * @returns {string|null}
 */
const formatTime = (date) => {
  if (!date) return null;
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
};

/**
 * Formats a Date to "DD MMM YYYY" string.
 * @param {Date} date
 * @returns {string}
 */
const formatDate = (date) => {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Finds a Trainer record by the User.id from the JWT token.
 * @param {number} userId - The User.id from JWT payload (integer).
 * @returns {Promise<Object|null>} The Trainer record or null.
 */
const findTrainerByUserId = async (userId) => {
  const trainer = await prisma.trainer.findUnique({
    where: { userId: String(userId) },
    select: { id: true, name: true, email: true },
  });
  return trainer;
};

/**
 * Gets all sessions assigned to a trainer.
 * Returns id, name, batch, and a computed displayLabel.
 * @param {string} trainerId - The Trainer.id (cuid).
 * @returns {Promise<Array>} Array of session objects.
 */
const getTrainerSessions = async (trainerId) => {
  const sessions = await prisma.trainerSession.findMany({
    where: { trainerId },
    select: { id: true, name: true, batch: true },
    orderBy: { createdAt: "asc" },
  });

  return sessions.map((s) => ({
    id: s.id,
    name: s.name,
    batch: s.batch,
    displayLabel: `${s.name} — ${s.batch}`,
  }));
};

/**
 * Verifies that a session belongs to the given trainer.
 * @param {string} sessionId - The TrainerSession.id.
 * @param {string} trainerId - The Trainer.id.
 * @returns {Promise<Object|null>} The session if owned, null otherwise.
 */
const verifySessionOwnership = async (sessionId, trainerId) => {
  const session = await prisma.trainerSession.findFirst({
    where: { id: sessionId, trainerId },
    select: { id: true, name: true, batch: true },
  });
  return session;
};

/**
 * Retrieves attendance data for a specific session on a specific date.
 *
 * Logic:
 *   1. Find the SessionOccurrence for the given session + date
 *   2. Fetch all enrolled students for the session
 *   3. For each student, find their attendance record (if any)
 *   4. Apply business rules: durationMins >= 10 → present, else absent
 *   5. Compute summary stats
 *   6. Optionally filter by status
 *
 * @param {string} sessionId - The TrainerSession.id.
 * @param {string} dateStr - Date string in YYYY-MM-DD format.
 * @param {string|undefined} statusFilter - Optional: 'present' or 'absent'.
 * @returns {Promise<Object>} Full attendance data with session info, summary, and students.
 */
const getAttendanceData = async (sessionId, dateStr, statusFilter) => {
  // Parse date range for the given day (UTC midnight to midnight)
  const dateStart = new Date(`${dateStr}T00:00:00.000Z`);
  const dateEnd = new Date(`${dateStr}T23:59:59.999Z`);

  // Fetch session, occurrence, enrollments in parallel
  const [session, occurrence, enrollments] = await Promise.all([
    prisma.trainerSession.findUnique({
      where: { id: sessionId },
      select: { id: true, name: true, batch: true },
    }),
    prisma.trainerSessionOccurrence.findFirst({
      where: {
        sessionId,
        date: { gte: dateStart, lte: dateEnd },
      },
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
      },
    }),
    prisma.trainerEnrollment.findMany({
      where: { sessionId },
      select: {
        student: {
          select: { id: true, name: true },
        },
      },
    }),
  ]);

  // No occurrence for this date
  if (!occurrence) {
    return {
      emptyState: true,
      message: "No session scheduled for this date",
      session: session
        ? { name: session.name, batch: session.batch, date: dateStr, time: null }
        : null,
      summary: { totalStudents: 0, present: 0, absent: 0, attendancePercentage: 0 },
      students: [],
    };
  }

  // No students enrolled
  if (!enrollments.length) {
    return {
      session: {
        name: session.name,
        batch: session.batch,
        date: formatDate(occurrence.date),
        time: `${formatTime(occurrence.startTime)} – ${formatTime(occurrence.endTime)}`,
      },
      summary: { totalStudents: 0, present: 0, absent: 0, attendancePercentage: 0 },
      students: [],
      emptyState: "No students enrolled",
    };
  }

  // Fetch attendance records for this occurrence
  const studentIds = enrollments.map((e) => e.student.id);
  const attendanceRecords = await prisma.trainerAttendance.findMany({
    where: {
      occurrenceId: occurrence.id,
      studentId: { in: studentIds },
    },
    select: {
      studentId: true,
      joinTime: true,
      leaveTime: true,
      durationMins: true,
      status: true,
      joinCount: true,
    },
  });

  // Index attendance by studentId for O(1) lookup
  const attendanceMap = new Map();
  for (const rec of attendanceRecords) {
    attendanceMap.set(rec.studentId, rec);
  }

  // Cross-reference the main Attendance model (keyed by LiveSession id = occurrence.id)
  // which stores totalDurationSeconds as an accurate sum of all individual join/leave
  // segments (maintained by heartbeat and leaveSession). This handles multi-join correctly
  // whereas TrainerAttendance only stores one joinTime/leaveTime pair.
  //
  // Lookup chain: TrainerStudent.email → User.id → Attendance.studentId + sessionId
  const trainerStudentIds = enrollments.map((e) => e.student.id);
  const trainerStudentRecords = await prisma.trainerStudent.findMany({
    where: { id: { in: trainerStudentIds } },
    select: { id: true, email: true },
  });
  const trainerStudentEmailMap = new Map(trainerStudentRecords.map((ts) => [ts.id, ts.email]));

  // occurrence.id equals the LiveSession.id (set during join)
  const liveSessionId = occurrence.id;
  const mainAttendanceRecords = await prisma.attendance.findMany({
    where: {
      sessionId: liveSessionId,
      occurrenceDate: { gte: dateStart, lte: dateEnd },
    },
    include: {
      events: { where: { leftAt: null } },
    },
  });

  // Map mainAttendance by userId for lookup; also pull User emails to bridge the gap
  const userIds = mainAttendanceRecords.map((a) => a.studentId);
  const userRecords = userIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true },
      })
    : [];
  const userEmailMap = new Map(userRecords.map((u) => [u.email, u.id]));
  // email → Attendance record
  const mainAttendanceByEmail = new Map();
  for (const att of mainAttendanceRecords) {
    const userRecord = userRecords.find((u) => u.id === att.studentId);
    if (userRecord) mainAttendanceByEmail.set(userRecord.email, att);
  }

  const now = new Date();

  // Build student list with attendance info
  let presentCount = 0;
  const allStudents = enrollments.map((e) => {
    const att = attendanceMap.get(e.student.id);
    let status = "absent";
    let joinTime = null;
    let leaveTime = null;
    let durationMins = 0;

    if (att) {
      joinTime = att.joinTime;
      leaveTime = att.leaveTime;

      // Prefer totalDurationSeconds from the main Attendance model (sum of all segments).
      const studentEmail = trainerStudentEmailMap.get(e.student.id);
      const mainAtt = studentEmail ? mainAttendanceByEmail.get(studentEmail) : null;

      if (mainAtt) {
        let totalSeconds = mainAtt.totalDurationSeconds || 0;
        // If no heartbeat was ever sent (totalSeconds=0) but there are open events,
        // compute live seconds as a fallback.
        if (totalSeconds === 0 && mainAtt.events && mainAtt.events.length > 0) {
          for (const event of mainAtt.events) {
            if (event.joinedAt) {
              let calcEnd = new Date();
              if (occurrence && occurrence.endTime && calcEnd > new Date(occurrence.endTime)) {
                calcEnd = new Date(occurrence.endTime);
              }
              totalSeconds += Math.max(0, Math.floor((calcEnd - new Date(event.joinedAt)) / 1000));
            }
          }
        }
        durationMins = Math.round(totalSeconds / 60);
      } else {
        // No main Attendance record: fall back to stored TrainerAttendance.durationMins.
        // For still-live sessions (no leaveTime), compute from joinTime as best effort.
        durationMins = att.durationMins || 0;
        if (joinTime && !leaveTime && durationMins === 0) {
          let calcEnd = new Date();
          if (occurrence && occurrence.endTime && calcEnd > new Date(occurrence.endTime)) {
            calcEnd = new Date(occurrence.endTime);
          }
          durationMins = Math.max(0, Math.round((calcEnd - new Date(joinTime)) / 60000));
        }
      }

      status = durationMins >= DURATION_THRESHOLD_MINS ? "present" : "absent";
    }

    if (status === "present") presentCount++;

    return {
      id: e.student.id,
      name: e.student.name,
      status,
      joinTime: formatTime(joinTime),
      leaveTime: formatTime(leaveTime),
      durationMins,
      duration: durationMins > 0 ? `${durationMins} mins` : "-",
      totalDurationSeconds: durationMins * 60,
      joinCount: att ? (att.joinCount || 1) : 0,
      joins: att ? (att.joinCount || 1) : 0,
      lastJoinedAt: joinTime ? new Date(joinTime).toISOString() : null
    };
  });

  const totalStudents = allStudents.length;
  const absentCount = totalStudents - presentCount;
  const attendancePercentage =
    totalStudents === 0
      ? 0
      : parseFloat(((presentCount / totalStudents) * 100).toFixed(2));

  // Apply status filter if provided (summary is always based on full list)
  const filteredStudents = statusFilter
    ? allStudents.filter((s) => s.status === statusFilter)
    : allStudents;

  return {
    session: {
      name: session.name,
      batch: session.batch,
      date: formatDate(occurrence.date),
      time: `${formatTime(occurrence.startTime)} – ${formatTime(occurrence.endTime)}`,
    },
    summary: {
      totalStudents,
      present: presentCount,
      absent: absentCount,
      attendancePercentage,
    },
    students: filteredStudents,
  };
};

/**
 * Marks or updates attendance for a student in a specific occurrence.
 *
 * Business rules:
 *   - durationMins = (leaveTime - joinTime) / 60000
 *   - status = durationMins >= 10 ? 'present' : 'absent'
 *   - If joinTime is null → status = 'absent', durationMins = 0
 *   - Uses upsert: creates if not exists, updates if exists
 *
 * @param {Object} params
 * @param {string} params.occurrenceId - The TrainerSessionOccurrence.id.
 * @param {string} params.studentId - The TrainerStudent.id.
 * @param {string|null} params.joinTime - ISO datetime string or null.
 * @param {string|null} params.leaveTime - ISO datetime string or null.
 * @returns {Promise<Object>} The created/updated attendance record.
 */
const markAttendance = async ({ occurrenceId, studentId, joinTime, leaveTime }) => {
  // Look up the occurrence to get the date
  const occurrence = await prisma.trainerSessionOccurrence.findUnique({
    where: { id: occurrenceId },
    select: { id: true, date: true },
  });

  if (!occurrence) {
    throw Object.assign(new Error("Session occurrence not found"), { statusCode: 404 });
  }

  let durationMins = 0;
  let status = "absent";

  if (joinTime && leaveTime) {
    const joinDate = new Date(joinTime);
    const leaveDate = new Date(leaveTime);
    durationMins = Math.round((leaveDate - joinDate) / 60000);
    status = durationMins >= DURATION_THRESHOLD_MINS ? "present" : "absent";
  }

  const record = await prisma.trainerAttendance.upsert({
    where: {
      studentId_occurrenceId: { studentId, occurrenceId },
    },
    update: {
      joinTime: joinTime ? new Date(joinTime) : null,
      leaveTime: leaveTime ? new Date(leaveTime) : null,
      durationMins,
      status,
      joinCount: { increment: 1 }
    },
    create: {
      studentId,
      occurrenceId,
      joinTime: joinTime ? new Date(joinTime) : null,
      leaveTime: leaveTime ? new Date(leaveTime) : null,
      durationMins,
      status,
      date: occurrence.date,
      joinCount: 1
    },
  });

  return record;
};

/**
 * Gets only the summary cards (no student list) for a session on a date.
 * @param {string} sessionId
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {Promise<Object>} Summary object.
 */
const getAttendanceSummary = async (sessionId, dateStr) => {
  const dateStart = new Date(`${dateStr}T00:00:00.000Z`);
  const dateEnd = new Date(`${dateStr}T23:59:59.999Z`);

  const [occurrence, enrollmentCount] = await Promise.all([
    prisma.trainerSessionOccurrence.findFirst({
      where: {
        sessionId,
        date: { gte: dateStart, lte: dateEnd },
      },
      select: { id: true },
    }),
    prisma.trainerEnrollment.count({ where: { sessionId } }),
  ]);

  if (!occurrence || enrollmentCount === 0) {
    return {
      totalStudents: enrollmentCount,
      present: 0,
      absent: enrollmentCount,
      attendancePercentage: 0,
    };
  }

  const attendances = await prisma.trainerAttendance.findMany({
    where: { occurrenceId: occurrence.id },
    select: { studentId: true, joinTime: true, leaveTime: true, durationMins: true }
  });

  const occurrenceData = await prisma.trainerSessionOccurrence.findUnique({
    where: { id: occurrence.id },
    select: { endTime: true }
  });

  // Cross-reference the main Attendance model via student email for accurate
  // totalDurationSeconds (sum of all join segments, not a single span).
  const trainerStudentIds = attendances.map((a) => a.studentId);
  const trainerStudents = trainerStudentIds.length > 0
    ? await prisma.trainerStudent.findMany({
        where: { id: { in: trainerStudentIds } },
        select: { id: true, email: true },
      })
    : [];
  const tsEmailMap = new Map(trainerStudents.map((ts) => [ts.id, ts.email]));
  const liveSessionId = occurrence.id;
  const mainAttendances = await prisma.attendance.findMany({
    where: {
      sessionId: liveSessionId,
      occurrenceDate: { gte: dateStart, lte: dateEnd },
    },
    include: { events: { where: { leftAt: null } } },
  });
  const mainUserIds = mainAttendances.map((a) => a.studentId);
  const mainUsers = mainUserIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: mainUserIds } },
        select: { id: true, email: true },
      })
    : [];
  const mainAttByEmail = new Map();
  for (const att of mainAttendances) {
    const u = mainUsers.find((u) => u.id === att.studentId);
    if (u) mainAttByEmail.set(u.email, att);
  }

  let presentCount = 0;
  for (const att of attendances) {
    const studentEmail = tsEmailMap.get(att.studentId);
    const mainAtt = studentEmail ? mainAttByEmail.get(studentEmail) : null;
    let dMins = 0;

    if (mainAtt) {
      // Use the accurate cumulative sum from the main system.
      let totalSeconds = mainAtt.totalDurationSeconds || 0;
      if (totalSeconds === 0 && mainAtt.events && mainAtt.events.length > 0) {
        for (const event of mainAtt.events) {
          if (event.joinedAt) {
            let calcEnd = new Date();
            if (occurrenceData && occurrenceData.endTime && calcEnd > new Date(occurrenceData.endTime)) {
              calcEnd = new Date(occurrenceData.endTime);
            }
            totalSeconds += Math.max(0, Math.floor((calcEnd - new Date(event.joinedAt)) / 1000));
          }
        }
      }
      dMins = Math.round(totalSeconds / 60);
    } else {
      // Fallback: use stored durationMins from TrainerAttendance.
      dMins = att.durationMins || 0;
      if (att.joinTime && !att.leaveTime && dMins === 0) {
        let calcEnd = new Date();
        if (occurrenceData && occurrenceData.endTime && calcEnd > new Date(occurrenceData.endTime)) {
          calcEnd = new Date(occurrenceData.endTime);
        }
        dMins = Math.max(0, Math.round((calcEnd - new Date(att.joinTime)) / 60000));
      }
    }

    if (dMins >= DURATION_THRESHOLD_MINS) {
      presentCount++;
    }
  }

  const absentCount = enrollmentCount - presentCount;
  const attendancePercentage =
    enrollmentCount === 0
      ? 0
      : parseFloat(((presentCount / enrollmentCount) * 100).toFixed(2));

  return {
    totalStudents: enrollmentCount,
    present: presentCount,
    absent: absentCount,
    attendancePercentage,
  };
};

module.exports = {
  findTrainerByUserId,
  getTrainerSessions,
  verifySessionOwnership,
  getAttendanceData,
  markAttendance,
  getAttendanceSummary,
};
