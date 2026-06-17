"use strict";

const prisma = require("../config/db");

// ─── Constants ────────────────────────────────────────────────────────────────

const STUDENT_THRESHOLD_PCT = 0.30;
const TRAINER_THRESHOLD_PCT = 0.85;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatTime = (date) => {
  if (!date) return null;
  return new Date(date).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
};

const formatDate = (date) => {
  if (!date) return null;
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
};

// ─── Service Functions ────────────────────────────────────────────────────────

const findTrainerByUserId = async (userId) => {
  // Now returning User instead of Trainer
  const user = await prisma.user.findUnique({
    where: { id: parseInt(userId) },
    select: { id: true, fullName: true, email: true },
  });
  if (user) {
    user.name = user.fullName;
  }
  return user;
};

const getTrainerSessions = async (trainerId) => {
  const sessions = await prisma.liveSession.findMany({
    where: { trainerId: parseInt(trainerId) },
    select: { id: true, title: true, courseTitle: true, isRecurring: true },
    orderBy: { createdAt: "asc" },
  });

  return sessions.map((s) => ({
    id: s.id,
    name: s.courseTitle || s.title,
    batch: s.title || "Live Class",
    displayLabel: `${s.courseTitle || s.title} — ${s.title || "Live Class"}`,
  }));
};

const verifySessionOwnership = async (sessionId, trainerId) => {
  const session = await prisma.liveSession.findFirst({
    where: { id: sessionId, trainerId: parseInt(trainerId) },
    select: { id: true, title: true, courseTitle: true },
  });
  return session;
};

const getAttendanceData = async (sessionId, dateStr, statusFilter) => {
  const dateStart = new Date(`${dateStr}T00:00:00.000Z`);
  const dateEnd = new Date(`${dateStr}T23:59:59.999Z`);

  const [session, occurrence, bookings] = await Promise.all([
    prisma.liveSession.findUnique({
      where: { id: sessionId },
      select: { id: true, title: true, courseTitle: true, trainerId: true },
    }),
    prisma.sessionOccurrence.findFirst({
      where: {
        sessionId,
        occurrenceDate: { gte: dateStart, lte: dateEnd },
      },
      select: {
        id: true,
        occurrenceDate: true,
        startsAt: true,
        endsAt: true,
      },
    }),
    prisma.sessionBooking.findMany({
      where: { sessionId },
      select: {
        student: {
          select: { id: true, fullName: true, email: true, role: true },
        },
      },
    }),
  ]);

  if (!occurrence) {
    return {
      emptyState: true,
      message: "No session scheduled for this date",
      session: session
        ? { name: session.courseTitle || session.title, batch: session.title, date: dateStr, time: null }
        : null,
      summary: { totalStudents: 0, present: 0, absent: 0, attendancePercentage: 0 },
      students: [],
    };
  }

  const enrollments = bookings;
  
  if (!enrollments.length && (!session || session.trainerId === undefined)) {
    return {
      session: {
        name: session ? (session.courseTitle || session.title) : "Session",
        batch: session ? session.title : "Live Class",
        date: formatDate(occurrence.occurrenceDate),
        time: `${formatTime(occurrence.startsAt)} – ${formatTime(occurrence.endsAt)}`,
      },
      summary: { totalStudents: 0, present: 0, absent: 0, attendancePercentage: 0 },
      students: [],
      emptyState: "No students enrolled",
    };
  }

  const liveSessionId = sessionId; // Main Attendance uses LiveSession id
  const mainAttendanceRecords = await prisma.attendance.findMany({
    where: {
      sessionId: liveSessionId,
      occurrenceDate: { gte: dateStart, lte: dateEnd },
    },
    include: {
      events: { orderBy: { joinedAt: "asc" } },
    },
  });

  const mainAttendanceByStudentId = new Map();
  for (const att of mainAttendanceRecords) {
    mainAttendanceByStudentId.set(att.studentId, att);
  }

  const sessionDurationMins = (occurrence.startsAt && occurrence.endsAt)
    ? Math.max(1, Math.round((new Date(occurrence.endsAt) - new Date(occurrence.startsAt)) / 60000))
    : 60;
  
  const studentRequiredMins = Math.ceil(sessionDurationMins * STUDENT_THRESHOLD_PCT);
  const trainerRequiredMins = Math.ceil(sessionDurationMins * TRAINER_THRESHOLD_PCT);

  let presentCount = 0;
  const allStudents = [];
  
  // Also include the trainer in the attendance list if they joined
  if (session && session.trainerId) {
     const trainerUser = await prisma.user.findUnique({
       where: { id: session.trainerId },
       select: { id: true, fullName: true, email: true, role: true }
     });
     if (trainerUser) {
        enrollments.push({ student: trainerUser });
     }
  }

  for (const e of enrollments) {
    const student = e.student;
    const role = student.role || "STUDENT";
    const isTrainer = role === "TRAINER" || role === "ADMIN";

    let status = "absent";
    let joinTime = null;
    let leaveTime = null;
    let durationMins = 0;
    let sessionHistory = [];
    let joinCount = 0;

    const mainAtt = mainAttendanceByStudentId.get(student.id);

    if (mainAtt) {
      if (mainAtt.events && mainAtt.events.length > 0) {
        joinCount = mainAtt.events.length;
        joinTime = mainAtt.events[0].joinedAt;
        let lastKnownLeftAt = null;
        for (let i = mainAtt.events.length - 1; i >= 0; i--) {
          if (mainAtt.events[i].leftAt) {
            lastKnownLeftAt = mainAtt.events[i].leftAt;
            break;
          }
        }
        leaveTime = lastKnownLeftAt;

        sessionHistory = mainAtt.events.map(ev => {
          let calcLeftAt = ev.leftAt;
          if (!calcLeftAt) {
             let calcEnd = new Date();
             if (occurrence.endsAt && calcEnd > new Date(occurrence.endsAt)) {
               calcEnd = new Date(occurrence.endsAt);
             }
             calcLeftAt = calcEnd;
          }
          return {
            joinedAt: ev.joinedAt ? new Date(ev.joinedAt).toISOString() : null,
            leftAt: calcLeftAt ? new Date(calcLeftAt).toISOString() : null
          };
        });
      }

      let totalSeconds = mainAtt.totalDurationSeconds || 0;
      if (totalSeconds === 0 && sessionHistory.length > 0) {
        for (const sh of sessionHistory) {
          if (sh.joinedAt && sh.leftAt) {
            totalSeconds += Math.max(0, Math.floor((new Date(sh.leftAt) - new Date(sh.joinedAt)) / 1000));
          }
        }
      }
      durationMins = Math.round(totalSeconds / 60);

      const requiredMins = isTrainer ? trainerRequiredMins : studentRequiredMins;
      status = durationMins >= requiredMins ? "present" : "absent";
    }

    // Ensure trainer isn't counted in the student "present" count
    if (status === "present" && !isTrainer) {
      presentCount++;
    }

    // Only add if not already added
    if (!allStudents.some(s => s.id === student.id)) {
      allStudents.push({
        id: student.id,
        name: student.fullName,
        role: role.toLowerCase(),
        isTrainer,
        status,
        joinTime: formatTime(joinTime),
        leaveTime: formatTime(leaveTime),
        durationMins,
        duration: `${durationMins} mins`,
        totalDurationSeconds: durationMins * 60,
        joinCount,
        joins: joinCount,
        lastJoinedAt: joinTime ? new Date(joinTime).toISOString() : null,
        sessionHistory
      });
    }
  }

  const studentOnlyRecords = allStudents.filter(s => !s.isTrainer);
  const totalStudents = studentOnlyRecords.length;
  const absentCount = totalStudents - presentCount;
  const attendancePercentage = totalStudents === 0 ? 0 : parseFloat(((presentCount / totalStudents) * 100).toFixed(2));

  const filteredStudents = statusFilter ? allStudents.filter((s) => s.status === statusFilter || s.isTrainer) : allStudents;

  return {
    session: {
      id: occurrence.id,
      name: session.courseTitle || session.title,
      batch: session.title,
      date: formatDate(occurrence.occurrenceDate),
      time: `${formatTime(occurrence.startsAt)} – ${formatTime(occurrence.endsAt)}`,
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

const markAttendance = async ({ occurrenceId, studentId, joinTime, leaveTime }) => {
  throw new Error("Manual marking not supported for Live Sessions.");
};

const getAttendanceSummary = async (sessionId, dateStr) => {
  const dateStart = new Date(`${dateStr}T00:00:00.000Z`);
  const dateEnd = new Date(`${dateStr}T23:59:59.999Z`);

  const [occurrence, enrollmentCount] = await Promise.all([
    prisma.sessionOccurrence.findFirst({
      where: {
        sessionId,
        occurrenceDate: { gte: dateStart, lte: dateEnd },
      },
      select: { id: true, startsAt: true, endsAt: true },
    }),
    prisma.sessionBooking.count({ where: { sessionId } }),
  ]);

  if (!occurrence || enrollmentCount === 0) {
    return {
      totalStudents: enrollmentCount,
      present: 0,
      absent: enrollmentCount,
      attendancePercentage: 0,
    };
  }

  const mainAttendances = await prisma.attendance.findMany({
    where: {
      sessionId,
      occurrenceDate: { gte: dateStart, lte: dateEnd },
    },
    include: { events: true },
  });

  const sessionDurationMins = (occurrence.startsAt && occurrence.endsAt)
    ? Math.max(1, Math.round((new Date(occurrence.endsAt) - new Date(occurrence.startsAt)) / 60000))
    : 60;
  const studentRequiredMins = Math.ceil(sessionDurationMins * STUDENT_THRESHOLD_PCT);

  let presentCount = 0;
  for (const mainAtt of mainAttendances) {
    // Only count students, not trainers (simplification for summary)
    
    let totalSeconds = mainAtt.totalDurationSeconds || 0;
    if (totalSeconds === 0 && mainAtt.events && mainAtt.events.length > 0) {
      for (const event of mainAtt.events) {
        if (event.joinedAt) {
          let calcEnd = new Date();
          if (occurrence.endsAt && calcEnd > new Date(occurrence.endsAt)) {
            calcEnd = new Date(occurrence.endsAt);
          }
          let calcLeftAt = event.leftAt || calcEnd;
          totalSeconds += Math.max(0, Math.floor((new Date(calcLeftAt) - new Date(event.joinedAt)) / 1000));
        }
      }
    }
    let dMins = Math.round(totalSeconds / 60);

    if (dMins >= studentRequiredMins) {
      presentCount++;
    }
  }

  const absentCount = enrollmentCount - presentCount;
  const attendancePercentage = enrollmentCount === 0 ? 0 : parseFloat(((presentCount / enrollmentCount) * 100).toFixed(2));

  return {
    totalStudents: enrollmentCount,
    present: presentCount,
    absent: absentCount,
    attendancePercentage,
  };
};

const extendSessionOccurrence = async (occurrenceId, additionalMinutes) => {
  const occurrence = await prisma.sessionOccurrence.findUnique({
    where: { id: occurrenceId },
  });

  if (!occurrence) {
    throw Object.assign(new Error("Session occurrence not found"), { statusCode: 404 });
  }

  const newEndTime = new Date(occurrence.endsAt.getTime() + additionalMinutes * 60000);

  const updated = await prisma.sessionOccurrence.update({
    where: { id: occurrenceId },
    data: { endsAt: newEndTime },
  });

  return updated;
};

module.exports = {
  findTrainerByUserId,
  getTrainerSessions,
  verifySessionOwnership,
  getAttendanceData,
  markAttendance,
  getAttendanceSummary,
  extendSessionOccurrence,
};
