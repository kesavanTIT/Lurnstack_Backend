const prisma = require("../config/db");
const {
  normalizeStatus,
  getDayRange,
  getDateKey,
  getDurationSeconds,
  isOccurrenceEnded,
  buildRosterForOccurrence,
  syncManualAttendanceStatus,
} = require("../services/adminAttendance.service");

// Helper for parsing global attendance filtersSSSSSSSsssssssssssssss
const buildGlobalFilters = (query) => {
  const { trainerId, courseId, studentId, sessionId, status, startDate, endDate, date } = query;
  const filter = {};
  const sessionFilter = {
    OR: [{ sectionType: { not: "TIT" } }, { sectionType: null }]
  };

  if (trainerId) sessionFilter.trainerId = parseInt(trainerId);
  if (courseId) sessionFilter.courseId = courseId === "unknown" ? null : courseId;
  if (studentId) filter.studentId = parseInt(studentId);
  if (sessionId) filter.sessionId = sessionId;
  if (status) filter.status = status;

  if (date) {
    const range = getDayRange(date);
    if (range) filter.occurrenceDate = { gte: range.start, lte: range.end };
  } else if (startDate || endDate) {
    filter.occurrenceDate = {};
    if (startDate) filter.occurrenceDate.gte = new Date(startDate);
    if (endDate) filter.occurrenceDate.lte = new Date(endDate);
  } else {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    filter.occurrenceDate = { lte: endOfToday };
  }

  filter.session = sessionFilter;

  return filter;
};

const emptySummary = (extra = {}) => ({
  totalStudents: 0,
  totalTrainers: 0,
  totalSessions: 0,
  totalRecords: 0,
  attendedCount: 0,
  presentCount: 0,
  lateCount: 0,
  absentCount: 0,
  pendingCount: 0,
  attendancePercentage: 0,
  ...extra,
});

const buildSummary = ({ totalStudents = 0, totalTrainers = 0, totalSessions = 0, presentCount = 0, lateCount = 0, absentCount = 0, pendingCount = 0 }) => {
  const attendedCount = presentCount + lateCount;
  const totalRecords = presentCount + lateCount + absentCount + pendingCount;
  const denominator = totalRecords || totalStudents || 0;
  return {
    totalStudents,
    totalTrainers,
    totalSessions,
    totalRecords,
    attendedCount,
    presentCount,
    lateCount,
    absentCount,
    pendingCount,
    attendancePercentage: denominator > 0 ? parseFloat(((attendedCount / denominator) * 100).toFixed(2)) : 0,
  };
};

const countPending = (roster) => Math.max(0, roster.totalStudents - roster.presentCount - roster.lateCount - roster.absentCount);
const COURSE_KEY_PREFIX = "standalone-";

const buildSessionFilter = (extra = {}) => ({
  status: { not: "deleted" },
  AND: [
    { OR: [{ sectionType: { not: "TIT" } }, { sectionType: null }] },
    { OR: [{ sessionType: { not: "TIT" } }, { sessionType: null }] },
    { OR: [{ source: { not: "admin_tit_classes" } }, { source: null }] },
  ],
  ...extra,
});

const getCourseKey = (session) => session?.courseId || `${COURSE_KEY_PREFIX}${session?.id}`;

const getTITCourseKey = (session) => `${COURSE_KEY_PREFIX}${session?.id}`;

const isStandaloneCourseKey = (courseKey) => String(courseKey || "").startsWith(COURSE_KEY_PREFIX);

const getSessionIdFromCourseKey = (courseKey) => String(courseKey || "").replace(COURSE_KEY_PREFIX, "");

const getCourseTitle = (session) => {
  if (session?.sectionType === "TIT" || session?.sessionType === "TIT" || session?.source === "admin_tit_classes") {
    return session?.title || session?.courseTitle || "Standalone Class";
  }
  return session?.courseTitle || session?.title || "Standalone Session";
};

const getOccurrenceRuntimeStatus = (occurrence, now = new Date()) => {
  if (!occurrence) return "pending";
  if (occurrence.status === "cancelled") return "cancelled";
  if (occurrence.status === "completed" || occurrence.finalizedAt) return "completed";
  if (occurrence.startsAt && occurrence.endsAt) {
    const startsAt = new Date(occurrence.startsAt);
    const endsAt = new Date(occurrence.endsAt);
    if (startsAt <= now && endsAt >= now) return "live";
    if (endsAt < now) return "completed";
    if (startsAt > now) return "upcoming";
  }
  return occurrence.status || "scheduled";
};

const getCourseRuntimeStatus = ({ sessions = [], occurrences = [] }) => {
  const now = new Date();
  if (sessions.some((session) => session.status === "paused")) return "paused";
  if (sessions.length > 0 && sessions.every((session) => ["ended", "completed"].includes(session.status))) {
    return "completed";
  }
  if (sessions.length > 0 && sessions.every((session) => session.status === "cancelled")) {
    return "cancelled";
  }
  if (occurrences.some((occurrence) => getOccurrenceRuntimeStatus(occurrence, now) === "live")) {
    return "live";
  }
  const hasCompleted = occurrences.some((occurrence) => getOccurrenceRuntimeStatus(occurrence, now) === "completed");
  const hasUpcoming = occurrences.some((occurrence) => getOccurrenceRuntimeStatus(occurrence, now) === "upcoming");
  if (hasCompleted && hasUpcoming) return "running";
  if (hasUpcoming) return "upcoming";
  if (hasCompleted) return "completed";
  return sessions.some((session) => session.status === "active") ? "running" : "pending";
};

const buildTrainerAttendanceFromOccurrence = (occurrence, session) => {
  const runtimeStatus = getOccurrenceRuntimeStatus(occurrence);
  const isAttended = runtimeStatus === "completed" || runtimeStatus === "live";
  const durationSeconds = occurrence?.startsAt && occurrence?.endsAt
    ? Math.max(0, Math.floor((new Date(occurrence.endsAt) - new Date(occurrence.startsAt)) / 1000))
    : 0;

  return {
    trainerId: session?.trainerId || occurrence?.trainerId || null,
    trainerName: session?.trainer?.fullName || occurrence?.trainer?.fullName || "Unassigned",
    trainerEmail: session?.trainer?.email || occurrence?.trainer?.email || null,
    status: isAttended ? "present" : "pending",
    inferred: true,
    source: "session_occurrence",
    firstJoinedAt: isAttended ? occurrence?.startsAt || null : null,
    lastJoinedAt: isAttended ? occurrence?.endsAt || null : null,
    joinCount: isAttended ? 1 : 0,
    durationMinutes: Math.round(durationSeconds / 60),
    totalDurationSeconds: durationSeconds,
  };
};

const getSessionsForCourseKey = async (courseKey) => {
  if (!courseKey) return [];

  const where = isStandaloneCourseKey(courseKey)
    ? buildSessionFilter({ id: getSessionIdFromCourseKey(courseKey) })
    : buildSessionFilter({ courseId: courseKey });

  return prisma.liveSession.findMany({
    where,
    include: {
      trainer: { select: { id: true, fullName: true, email: true } },
      occurrences: {
        orderBy: { occurrenceDate: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
};

const buildCourseSummaryFromSessions = async (sessions) => {
  const occurrenceRows = [];
  const allOccurrences = sessions.flatMap((session) =>
    (session.occurrences || []).map((occurrence) => ({ ...occurrence, session }))
  );

  let presentCount = 0;
  let lateCount = 0;
  let absentCount = 0;
  let pendingCount = 0;
  const studentSet = new Set();

  for (const occurrence of allOccurrences) {
    const roster = await buildRosterForOccurrence({
      session: occurrence.session,
      occurrence,
      date: occurrence.occurrenceDate,
    });

    roster.students.forEach((student) => studentSet.add(student.studentId));
    presentCount += roster.presentCount;
    lateCount += roster.lateCount;
    absentCount += roster.absentCount;
    pendingCount += countPending(roster);

    occurrenceRows.push({
      ...formatOccurrenceRow({ occurrence, roster }),
      runtimeStatus: getOccurrenceRuntimeStatus(occurrence),
      trainerAttendance: buildTrainerAttendanceFromOccurrence(occurrence, occurrence.session),
    });
  }

  occurrenceRows.sort((a, b) => new Date(b.startsAt || b.date) - new Date(a.startsAt || a.date));

  const firstSession = sessions[0] || null;
  const summary = buildSummary({
    totalStudents: studentSet.size,
    totalSessions: allOccurrences.length || sessions.length,
    presentCount,
    lateCount,
    absentCount,
    pendingCount,
  });

  return {
    courseKey: firstSession ? getCourseKey(firstSession) : null,
    courseId: firstSession?.courseId || null,
    courseTitle: getCourseTitle(firstSession),
    trainerId: firstSession?.trainerId || null,
    trainerName: firstSession?.trainer?.fullName || "Unassigned",
    trainerEmail: firstSession?.trainer?.email || null,
    status: getCourseRuntimeStatus({ sessions, occurrences: allOccurrences }),
    totalStudents: studentSet.size,
    totalSessions: allOccurrences.length || sessions.length,
    completedSessions: occurrenceRows.filter((row) => row.runtimeStatus === "completed").length,
    liveSessions: occurrenceRows.filter((row) => row.runtimeStatus === "live").length,
    upcomingSessions: occurrenceRows.filter((row) => row.runtimeStatus === "upcoming").length,
    presentCount,
    lateCount,
    absentCount,
    pendingCount,
    attendedCount: presentCount + lateCount,
    attendancePercentage: summary.attendancePercentage,
    summary,
    occurrences: occurrenceRows,
    sessions: sessions.map((session) => ({
      id: session.id,
      title: session.title,
      courseId: session.courseId,
      courseTitle: getCourseTitle(session),
      trainerId: session.trainerId,
      trainerName: session.trainer?.fullName || "Unassigned",
      status: session.status,
      startTime: session.startTime,
      endTime: session.endTime,
      isRecurring: session.isRecurring,
      recurrenceType: session.recurrenceType,
      totalDays: session.totalDays,
      totalHours: session.totalHours,
    })),
  };
};

const formatStudentRow = ({ row, session, occurrence }) => {
  const date = getDateKey(row.occurrenceDate || occurrence?.occurrenceDate);
  let durationSeconds = row.totalDurationSeconds || 0;

  // If mobile user and occurrence ended, auto-estimate duration for display
  const isMobile = row.source === "mobile_join";
  if (isMobile && isOccurrenceEnded(occurrence) && occurrence.endsAt) {
    const firstJoined = row.firstJoinedAt;
    if (firstJoined) {
      const ends = new Date(occurrence.endsAt);
      const joinedDate = new Date(firstJoined);
      const estimatedSeconds = Math.max(0, Math.floor((ends.getTime() - joinedDate.getTime()) / 1000));
      if (estimatedSeconds > durationSeconds) {
        durationSeconds = estimatedSeconds;
      }
    }
  }

  return {
    attendanceId: row.attendanceId || row.studentAttendanceId || null,
    studentAttendanceId: row.studentAttendanceId || null,
    studentId: row.studentId,
    fullName: row.fullName,
    name: row.fullName,
    email: row.email,
    sessionId: session?.id || row.sessionId || occurrence?.sessionId || null,
    courseId: session?.courseId || occurrence?.courseId || null,
    date,
    occurrenceDate: date,
    status: normalizeStatus(row.status),
    firstJoinedAt: row.firstJoinedAt,
    lastJoinedAt: row.lastJoinedAt,
    joinCount: row.joinCount || 0,
    durationMinutes: Math.round(durationSeconds / 60),
    totalDurationSeconds: durationSeconds,
  };
};

const formatOccurrenceRow = ({ occurrence, roster }) => {
  const session = occurrence.session;
  const pendingCount = countPending(roster);
  return {
    id: occurrence.id,
    occurrenceId: occurrence.id,
    sessionId: occurrence.sessionId,
    courseId: occurrence.courseId,
    sessionTitle: session?.title || session?.courseTitle || "Unknown Session",
    courseTitle: session?.courseTitle || session?.title || "Standalone Session",
    occurrenceDate: getDateKey(occurrence.occurrenceDate),
    date: getDateKey(occurrence.occurrenceDate),
    startsAt: occurrence.startsAt,
    endsAt: occurrence.endsAt,
    status: occurrence.status || "scheduled",
    totalStudents: roster.totalStudents,
    attendedCount: roster.attendedCount,
    presentCount: roster.presentCount,
    lateCount: roster.lateCount,
    absentCount: roster.absentCount,
    pendingCount,
    attendancePercentage: roster.attendancePercentage,
  };
};

const getOccurrenceDateFilter = (query) => {
  if (!query || !query.date || String(query.date).trim() === "" || String(query.date).trim() === "null" || String(query.date).trim() === "undefined") {
    return {};
  }
  const range = getDayRange(query.date);
  return range ? { occurrenceDate: { gte: range.start, lte: range.end } } : {};
};

const buildStatusFilter = (status) => {
  if (!status) return {};
  const normalized = normalizeStatus(status);
  if (normalized === "present") return { status: { in: ["present", "joined", "completed"] } };
  return { status: normalized };
};

const buildCourseAndTrainerAttendance = async (query = {}) => {
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const dateFilter = getOccurrenceDateFilter(query);
  const finalDateFilter = Object.keys(dateFilter).length > 0 
    ? dateFilter 
    : { occurrenceDate: { lte: endOfToday } };
  const occurrences = await prisma.sessionOccurrence.findMany({
    where: {
      ...finalDateFilter,
      session: { OR: [{ sectionType: { not: "TIT" } }, { sectionType: null }] },
    },
    include: {
      trainer: { select: { id: true, fullName: true, email: true } },
      session: { include: { trainer: { select: { id: true, fullName: true, email: true } } } },
    },
    orderBy: { occurrenceDate: "desc" },
  });

  const courseMap = new Map();
  const trainerMap = new Map();
  const occurrenceRows = [];

  for (const occurrence of occurrences) {
    const roster = await buildRosterForOccurrence({
      session: occurrence.session,
      occurrence,
      date: occurrence.occurrenceDate,
    });
    const row = formatOccurrenceRow({ occurrence, roster });
    occurrenceRows.push(row);

    const courseKey = occurrence.session?.courseId || occurrence.courseId || "unknown";
    if (!courseMap.has(courseKey)) {
      courseMap.set(courseKey, {
        courseId: occurrence.session?.courseId || occurrence.courseId || null,
        courseTitle: occurrence.session?.courseTitle || occurrence.session?.title || "Standalone Session",
        trainerId: occurrence.trainerId,
        trainerName: occurrence.trainer?.fullName || occurrence.session?.trainer?.fullName || "Unassigned",
        totalSessions: 0,
        totalStudentsSet: new Set(),
        presentCount: 0,
        lateCount: 0,
        absentCount: 0,
        pendingCount: 0,
      });
    }
    const course = courseMap.get(courseKey);
    course.totalSessions += 1;
    roster.students.forEach((student) => course.totalStudentsSet.add(student.studentId));
    course.presentCount += roster.presentCount;
    course.lateCount += roster.lateCount;
    course.absentCount += roster.absentCount;
    course.pendingCount += countPending(roster);

    const trainerKey = String(occurrence.trainerId || "unknown");
    if (!trainerMap.has(trainerKey)) {
      trainerMap.set(trainerKey, {
        trainerId: occurrence.trainerId,
        trainerName: occurrence.trainer?.fullName || occurrence.session?.trainer?.fullName || "Unassigned",
        totalSessions: 0,
        presentCount: 0,
        lateCount: 0,
        absentCount: 0,
        pendingCount: 0,
        latest: null,
      });
    }
    const trainer = trainerMap.get(trainerKey);
    trainer.totalSessions += 1;
    const status = isOccurrenceEnded(occurrence) ? "present" : "pending";
    if (status === "present") trainer.presentCount += 1;
    else trainer.pendingCount += 1;
    if (!trainer.latest || new Date(occurrence.occurrenceDate) > new Date(trainer.latest.occurrenceDate)) {
      trainer.latest = occurrence;
    }
  }

  const courses = Array.from(courseMap.values()).map((course) => {
    const summary = buildSummary({
      totalStudents: course.totalStudentsSet.size,
      totalSessions: course.totalSessions,
      presentCount: course.presentCount,
      lateCount: course.lateCount,
      absentCount: course.absentCount,
      pendingCount: course.pendingCount,
    });
    return {
      courseId: course.courseId,
      courseTitle: course.courseTitle,
      trainerId: course.trainerId,
      trainerName: course.trainerName,
      totalSessions: course.totalSessions,
      totalStudents: course.totalStudentsSet.size,
      attendedCount: summary.attendedCount,
      presentCount: course.presentCount,
      lateCount: course.lateCount,
      absentCount: course.absentCount,
      pendingCount: course.pendingCount,
      attendancePercentage: summary.attendancePercentage,
    };
  });

  const trainerAttendance = Array.from(trainerMap.values()).map((trainer) => {
    const latest = trainer.latest;
    const summary = buildSummary({
      totalSessions: trainer.totalSessions,
      presentCount: trainer.presentCount,
      lateCount: trainer.lateCount,
      absentCount: trainer.absentCount,
      pendingCount: trainer.pendingCount,
    });
    const durationSeconds = latest?.startsAt && latest?.endsAt
      ? Math.max(0, Math.floor((new Date(latest.endsAt) - new Date(latest.startsAt)) / 1000))
      : 0;
    return {
      trainerId: trainer.trainerId,
      trainerName: trainer.trainerName,
      totalSessions: trainer.totalSessions,
      attendedCount: summary.attendedCount,
      presentCount: trainer.presentCount,
      lateCount: trainer.lateCount,
      absentCount: trainer.absentCount,
      pendingCount: trainer.pendingCount,
      attendancePercentage: summary.attendancePercentage,
      latestSessionId: latest?.sessionId || null,
      latestSessionTitle: latest?.session?.title || latest?.session?.courseTitle || null,
      courseTitle: latest?.session?.courseTitle || null,
      startsAt: latest?.startsAt || null,
      endsAt: latest?.endsAt || null,
      firstJoinedAt: isOccurrenceEnded(latest) ? latest?.startsAt || null : null,
      lastJoinedAt: isOccurrenceEnded(latest) ? latest?.endsAt || null : null,
      durationMinutes: Math.round(durationSeconds / 60),
      totalDurationSeconds: durationSeconds,
      status: latest ? (isOccurrenceEnded(latest) ? "present" : "pending") : "pending",
    };
  });

  return { occurrences, occurrenceRows, courses, trainerAttendance };
};

// @desc    Get global overview (metrics)
// @route   GET /api/admin/attendance/overview
const getAttendanceOverview = async (req, res) => {
  try {
    const totalTrainers = await prisma.user.count({ where: { role: 'TRAINER' } });
    const totalStudents = await prisma.user.count({ where: { role: 'STUDENT' } });
    const { courses, trainerAttendance } = await buildCourseAndTrainerAttendance(req.query);
    const totalSessions = courses.reduce((sum, course) => sum + course.totalSessions, 0);
    const presentCount = courses.reduce((sum, course) => sum + course.presentCount, 0);
    const lateCount = courses.reduce((sum, course) => sum + course.lateCount, 0);
    const absentCount = courses.reduce((sum, course) => sum + course.absentCount, 0);
    const pendingCount = courses.reduce((sum, course) => sum + course.pendingCount, 0);
    const attendedCount = presentCount + lateCount;
    const summary = buildSummary({
      totalStudents,
      totalTrainers,
      totalSessions,
      presentCount,
      lateCount,
      absentCount,
      pendingCount,
    });

    return res.status(200).json({
      success: true,
      data: {
        summary,
        totalCourses: courses.length,
        totalTrainers,
        totalStudents,
        totalSessions,
        completedSessions: trainerAttendance.reduce((sum, trainer) => sum + trainer.presentCount, 0),
        presentCount,
        lateCount,
        absentCount,
        pendingCount,
        attendedCount,
        averageAttendancePercentage: summary.attendancePercentage,
        attendancePercentage: summary.attendancePercentage,
        trainerPresentCount: trainerAttendance.reduce((sum, trainer) => sum + trainer.presentCount, 0),
        trainerAbsentCount: trainerAttendance.reduce((sum, trainer) => sum + trainer.absentCount, 0),
        trainerAttendancePercentage: trainerAttendance.length > 0
          ? parseFloat((trainerAttendance.reduce((sum, trainer) => sum + trainer.attendancePercentage, 0) / trainerAttendance.length).toFixed(2))
          : 0,
        courses,
        trainerAttendance,
      }
    });
  } catch (error) {
    console.error("Admin Attendance Overview Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch attendance overview." });
  }
};

// @desc    Get trainer attendance
// @route   GET /api/admin/trainers/:trainerId/attendance
const getTrainerAttendanceAdmin = async (req, res) => {
  try {
    const { trainerId } = req.params;
    const { courseId, startDate, endDate, date } = req.query;
    
    const filter = { trainerId: parseInt(trainerId) };
    if (courseId) {
      if (courseId === "unknown") filter.session = { courseId: null };
      else filter.session = { courseId };
    }
    if (date) {
      const range = getDayRange(date);
      if (range) filter.occurrenceDate = { gte: range.start, lte: range.end };
    } else if (startDate || endDate) {
      filter.occurrenceDate = {};
      if (startDate) filter.occurrenceDate.gte = new Date(startDate);
      if (endDate) filter.occurrenceDate.lte = new Date(endDate);
    } else {
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      filter.occurrenceDate = { lte: endOfToday };
    }
    
    const sessionFilter = filter.session ? { ...filter.session, OR: [{ sectionType: { not: 'TIT' } }, { sectionType: null }] } : { OR: [{ sectionType: { not: 'TIT' } }, { sectionType: null }] };

    const occurrences = await prisma.sessionOccurrence.findMany({
      where: {
        ...filter,
        session: sessionFilter
      },
      include: {
        session: true,
        trainer: { select: { id: true, fullName: true, email: true } }
      },
      orderBy: { occurrenceDate: "desc" }
    });

    let presentCount = 0, lateCount = 0, absentCount = 0, pendingCount = 0;
    const formattedData = occurrences.map(occ => {
      const inferredStatus = isOccurrenceEnded(occ) ? "present" : "pending";
      if (inferredStatus === "present") presentCount++;
      else pendingCount++;
      const durationSeconds = occ.startsAt && occ.endsAt ? Math.max(0, Math.floor((new Date(occ.endsAt) - new Date(occ.startsAt)) / 1000)) : 0;
      
      return {
        id: occ.id,
        trainerAttendanceId: occ.id,
        sessionId: occ.sessionId,
        courseId: occ.courseId,
        courseTitle: occ.session?.courseTitle || occ.session?.title || "Standalone Session",
        sessionTitle: occ.session?.title || occ.session?.courseTitle || "Unknown Session",
        date: getDateKey(occ.occurrenceDate),
        occurrenceDate: getDateKey(occ.occurrenceDate),
        startsAt: occ.startsAt,
        endsAt: occ.endsAt,
        status: inferredStatus,
        trainer: occ.trainer,
        firstJoinedAt: inferredStatus === "present" ? occ.startsAt : null,
        lastJoinedAt: inferredStatus === "present" ? occ.endsAt : null,
        joinCount: inferredStatus === "present" ? 1 : 0,
        durationMinutes: Math.round(durationSeconds / 60),
        totalDurationSeconds: durationSeconds,
        presentCount: inferredStatus === "present" ? 1 : 0,
        lateCount: 0,
        absentCount: 0,
        attendedCount: inferredStatus === "present" ? 1 : 0,
        attendancePercentage: inferredStatus === "present" ? 100 : 0,
      };
    });

    const trainerName = formattedData[0]?.trainer?.fullName || formattedData[0]?.trainerName || "Trainer";
    const summary = buildSummary({
      totalSessions: formattedData.length,
      presentCount,
      lateCount,
      absentCount,
      pendingCount,
    });

    return res.status(200).json({
      success: true,
      data: {
        trainerId: parseInt(trainerId),
        trainerName,
        summary,
        records: formattedData,
        // Backward compatibility for older frontend code expecting an array-ish payload.
        items: formattedData,
      }
    });
  } catch (error) {
    console.error("Admin Trainer Attendance Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch trainer attendance." });
  }
};

// @desc    Get attendance summary for all courses
// @route   GET /api/admin/attendance/courses
const getAllCoursesAttendance = async (req, res) => {
  try {
    const { courses } = await buildCourseAndTrainerAttendance(req.query);
    return res.status(200).json({
      success: true,
      data: {
        courses,
        // Backward compatibility for older frontend code that mapped data directly.
        items: courses,
      }
    });
  } catch (error) {
    console.error("Admin All Courses Attendance Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch courses attendance." });
  }
};

// @desc    Get attendance summary for a specific course
// @route   GET /api/admin/courses/:courseId/attendance-summary
const getCourseAttendanceSummaryAdmin = async (req, res) => {
  try {
    const { courseId } = req.params;
    const queryCourseId = courseId === "unknown" ? null : courseId;

    const occurrences = await prisma.sessionOccurrence.findMany({
      where: {
        OR: [
          { courseId: queryCourseId },
          { session: { courseId: queryCourseId } }
        ],
        session: {
          OR: [{ sectionType: { not: 'TIT' } }, { sectionType: null }]
        }
      },
      include: {
        session: { include: { trainer: { select: { id: true, fullName: true, email: true } } } }
      },
      orderBy: { occurrenceDate: "desc" }
    });

    const summaryMap = [];
    let presentCount = 0, lateCount = 0, absentCount = 0, pendingCount = 0;
    const studentSet = new Set();

    for (const occ of occurrences) {
      const roster = await buildRosterForOccurrence({
        session: occ.session,
        occurrence: occ,
        date: occ.occurrenceDate,
      });
      roster.students.forEach((student) => studentSet.add(student.studentId));
      presentCount += roster.presentCount;
      lateCount += roster.lateCount;
      absentCount += roster.absentCount;
      pendingCount += countPending(roster);

      summaryMap.push(formatOccurrenceRow({ occurrence: occ, roster }));
    }

    summaryMap.sort((a, b) => new Date(b.date) - new Date(a.date));
    const firstSession = occurrences[0]?.session;
    const summary = buildSummary({
      totalStudents: studentSet.size,
      totalSessions: summaryMap.length,
      presentCount,
      lateCount,
      absentCount,
      pendingCount,
    });

    return res.status(200).json({
      success: true,
      data: {
        courseId: firstSession?.courseId || queryCourseId,
        courseTitle: firstSession?.courseTitle || firstSession?.title || "Course",
        trainerId: firstSession?.trainerId || null,
        trainerName: firstSession?.trainer?.fullName || "Unassigned",
        summary,
        occurrences: summaryMap,
        // Backward compatibility for older frontend code that expected an array.
        items: summaryMap,
      }
    });
  } catch (error) {
    console.error("Admin Course Attendance Summary Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch course attendance summary." });
  }
};

// @desc    Get session attendance
// @route   GET /api/admin/sessions/:sessionId/attendance
const getSessionAttendanceAdmin = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { date } = req.query;

    const session = await prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: {
        trainer: { select: { id: true, fullName: true } }
      }
    });

    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }

    if (date) {
      req.params.date = date;
      return getDayWiseSessionAttendance(req, res);
    }

    const studentsArray = [];
    let presentCount = 0, lateCount = 0, absentCount = 0;

    const occurrences = await prisma.sessionOccurrence.findMany({
      where: { sessionId },
      orderBy: { occurrenceDate: "desc" },
    });

    if (occurrences.length > 0 && session) {
      for (const occurrence of occurrences) {
        const roster = await buildRosterForOccurrence({
          session,
          occurrence,
          date: occurrence.occurrenceDate,
        });
        presentCount += roster.presentCount;
        lateCount += roster.lateCount;
        absentCount += roster.absentCount;
        studentsArray.push(...roster.students.map((row) => formatStudentRow({ row, session, occurrence })));
      }
    } else if (session) {
      const attendances = await prisma.attendance.findMany({
        where: { sessionId },
        include: {
          student: { select: { id: true, fullName: true, email: true } },
          events: { orderBy: { joinedAt: "asc" } },
        },
      });

      attendances.forEach(a => {
        const status = normalizeStatus(a.status);
        if (status === 'present') presentCount++;
        else if (status === 'late') lateCount++;
        else if (status === 'absent') absentCount++;

        studentsArray.push({
          attendanceId: a.id,
          studentAttendanceId: null,
          studentId: a.studentId,
          fullName: a.student?.fullName || "Unknown",
          name: a.student?.fullName || "Unknown",
          email: a.student?.email || "N/A",
          sessionId: a.sessionId,
          courseId: session.courseId,
          date: getDateKey(a.occurrenceDate),
          occurrenceDate: getDateKey(a.occurrenceDate),
          status,
          firstJoinedAt: a.firstJoinedAt,
          lastJoinedAt: a.lastJoinedAt,
          joinCount: a.joinCount,
          durationMinutes: Math.round(getDurationSeconds(a, { endsAt: session?.endedAt || session?.endTime }) / 60),
          totalDurationSeconds: getDurationSeconds(a, { endsAt: session?.endedAt || session?.endTime })
        });
      });
    }

    const totalStudents = studentsArray.length;
    const attendedCount = presentCount + lateCount;
    const pendingCount = Math.max(0, totalStudents - presentCount - lateCount - absentCount);
    const summary = buildSummary({
      totalStudents,
      totalSessions: occurrences.length || 1,
      presentCount,
      lateCount,
      absentCount,
      pendingCount,
    });

    const trainerAttendance = {
      trainerId: session?.trainerId || null,
      trainerName: session?.trainer?.fullName || "Unassigned",
      status: session?.endedAt || session?.status === 'completed' ? "present" : (session?.status === 'live' ? "present" : "pending"),
      durationMinutes: session?.durationMinutes || 60,
    };

    const responseData = {
      sessionId: sessionId,
      sessionTitle: session?.title || session?.courseTitle || "Unknown Session",
      courseId: session?.courseId || null,
      courseTitle: session?.courseTitle || null,
      trainerId: session?.trainerId || null,
      trainerName: session?.trainer?.fullName || null,
      summary,
      totalStudents,
      presentCount,
      lateCount,
      absentCount,
      pendingCount,
      attendedCount,
      attendancePercentage: summary.attendancePercentage,
      trainerAttendance,
      students: studentsArray
    };

    return res.status(200).json({ success: true, data: responseData });
  } catch (error) {
    console.error("Admin Session Attendance Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch session attendance." });
  }
};

// @desc    Get specific student attendance
// @route   GET /api/admin/students/:studentId/attendance
const getStudentAttendanceAdmin = async (req, res) => {
  try {
    const { studentId } = req.params;
    const filter = buildGlobalFilters(req.query);
    filter.studentId = parseInt(studentId);

    const attendances = await prisma.studentAttendance.findMany({
      where: filter,
      include: {
        session: true,
        occurrence: true,
        student: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { occurrenceDate: "desc" }
    });

    const legacyAttendances = await prisma.attendance.findMany({
      where: filter,
      include: { events: true },
    });
    const legacyByKey = new Map(
      legacyAttendances.map((a) => [`${a.sessionId}-${a.studentId}-${a.occurrenceDate.toISOString()}`, a])
    );

    let studentName = "Student";
    const formatted = attendances.map((a) => {
      const legacy = legacyByKey.get(`${a.sessionId}-${a.studentId}-${a.occurrenceDate.toISOString()}`);
      const durationSeconds = getDurationSeconds(legacy, a.occurrence);
      studentName = a.student?.fullName || studentName;
      return {
        attendanceId: legacy?.id || a.id,
        studentAttendanceId: a.id,
        sessionId: a.sessionId,
        courseId: a.session?.courseId || null,
        courseTitle: a.session?.courseTitle || a.session?.title || "Standalone Session",
        sessionTitle: a.session?.title || "Unknown Session",
        date: getDateKey(a.occurrenceDate),
        occurrenceDate: getDateKey(a.occurrenceDate),
        status: normalizeStatus(a.status),
        firstJoinedAt: a.firstJoinedAt,
        lastJoinedAt: a.lastJoinedAt,
        joinCount: a.joinCount,
        totalDurationSeconds: durationSeconds,
        durationMinutes: Math.round(durationSeconds / 60),
      };
    });

    const presentCount = formatted.filter((record) => record.status === "present").length;
    const lateCount = formatted.filter((record) => record.status === "late").length;
    const absentCount = formatted.filter((record) => record.status === "absent").length;
    const pendingCount = formatted.filter((record) => record.status === "pending").length;
    const summary = buildSummary({
      totalSessions: formatted.length,
      presentCount,
      lateCount,
      absentCount,
      pendingCount,
    });

    return res.status(200).json({
      success: true,
      data: {
        studentId: parseInt(studentId),
        studentName,
        summary,
        records: formatted,
        items: formatted,
      }
    });
  } catch (error) {
    console.error("Admin Student Attendance Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch student attendance." });
  }
};

// @desc    Manually update attendance record
// @route   PATCH /api/admin/attendance/:attendanceId
const updateAttendanceRecord = async (req, res) => {
  try {
    const { attendanceId } = req.params;
    const { status } = req.body;

    if (!["pending", "present", "late", "absent"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status." });
    }

    const updated = await syncManualAttendanceStatus({ attendanceId, status });
    const updatedAt = updated.attendance?.updatedAt || updated.studentAttendance?.updatedAt || new Date();

    return res.status(200).json({
      success: true,
      message: "Attendance updated successfully",
      data: {
        attendanceId: updated.attendance?.id || attendanceId,
        studentAttendanceId: updated.studentAttendance?.id || null,
        status: normalizeStatus(status),
        updatedAt,
      }
    });
  } catch (error) {
    console.error("Admin Update Attendance Error:", error);
    const statusCode = error.message === "Attendance record not found." ? 404 : 500;
    return res.status(statusCode).json({ success: false, message: error.message || "Failed to update attendance." });
  }
};

// @desc    Get all attendance records
// @route   GET /api/admin/attendance
const getAllAttendanceRecords = async (req, res) => {
  try {
    const filter = buildGlobalFilters(req.query);
    const sessionFilter = {
      ...(filter.session || {}),
      OR: [{ sectionType: { not: 'TIT' } }, { sectionType: null }],
    };
    delete filter.session;

    const studentAttendanceFilter = { ...filter };
    const requestedStatus = studentAttendanceFilter.status;
    delete studentAttendanceFilter.status;

    const studentAttendances = await prisma.studentAttendance.findMany({
      where: {
        ...studentAttendanceFilter,
        ...buildStatusFilter(requestedStatus),
        session: sessionFilter,
      },
      include: {
        session: { include: { trainer: { select: { id: true, fullName: true } } } },
        student: { select: { id: true, fullName: true, email: true } }
      },
      orderBy: { occurrenceDate: "desc" }
    });

    const legacyAttendances = await prisma.attendance.findMany({
      where: {
        ...filter,
        ...buildStatusFilter(requestedStatus),
        session: sessionFilter,
      },
      include: {
        events: true,
        session: { include: { trainer: { select: { id: true, fullName: true } } } },
        student: { select: { id: true, fullName: true, email: true } }
      },
      orderBy: { occurrenceDate: "desc" }
    });

    const legacyByKey = new Map();
    legacyAttendances.forEach((attendance) => {
      const key = `${attendance.sessionId}-${attendance.studentId}-${attendance.occurrenceDate.toISOString()}`;
      legacyByKey.set(key, attendance);
    });

    const occurrenceSessionIds = [...new Set([...studentAttendances, ...legacyAttendances].map((a) => a.sessionId).filter(Boolean))];
    const occurrenceDates = [...new Set([...studentAttendances, ...legacyAttendances].map((a) => a.occurrenceDate.toISOString()))].map((value) => new Date(value));
    const occurrenceMap = new Map();
    if (occurrenceSessionIds.length > 0 && occurrenceDates.length > 0) {
      const occurrences = await prisma.sessionOccurrence.findMany({
        where: {
          sessionId: { in: occurrenceSessionIds },
          occurrenceDate: { in: occurrenceDates },
        },
      });
      occurrences.forEach((occurrence) => {
        occurrenceMap.set(`${occurrence.sessionId}-${occurrence.occurrenceDate.toISOString()}`, occurrence);
      });
    }

    const seenKeys = new Set();
    const formattedData = studentAttendances.map(a => {
      const key = `${a.sessionId}-${a.studentId}-${a.occurrenceDate.toISOString()}`;
      seenKeys.add(key);
      const legacyAttendance = legacyByKey.get(key);
      const occurrence = occurrenceMap.get(`${a.sessionId}-${a.occurrenceDate.toISOString()}`);
      const durationSeconds = getDurationSeconds(legacyAttendance, occurrence);
      let durationMinutes = Math.round(durationSeconds / 60);
      const status = normalizeStatus(a.status);
      return {
        id: legacyAttendance?.id || a.id,
        attendanceId: legacyAttendance?.id || a.id,
        studentAttendanceId: a.id,
        studentId: a.studentId,
        fullName: a.student?.fullName || "Unknown",
        name: a.student?.fullName || "Unknown",
        email: a.student?.email || "N/A",
        sessionId: a.sessionId,
        courseId: a.session?.courseId,
        courseTitle: a.session?.courseTitle || a.session?.title || "Standalone Session",
        courseName: a.session?.courseTitle || a.session?.title || "Standalone Session",
        sessionTitle: a.session?.title || "Unknown Session",
        trainerId: a.session?.trainerId || null,
        trainerName: a.session?.trainer?.fullName || "Unassigned",
        studentName: a.student?.fullName || "Unknown",
        date: getDateKey(a.occurrenceDate),
        occurrenceDate: getDateKey(a.occurrenceDate),
        startsAt: occurrence?.startsAt || null,
        endsAt: occurrence?.endsAt || null,
        status,
        durationMinutes,
        firstJoinedAt: a.firstJoinedAt,
        lastJoinedAt: a.lastJoinedAt,
        joinCount: a.joinCount,
        totalDurationSeconds: durationSeconds
      };
    });

    legacyAttendances.forEach((a) => {
      const key = `${a.sessionId}-${a.studentId}-${a.occurrenceDate.toISOString()}`;
      if (seenKeys.has(key)) return;

      const status = normalizeStatus(a.status);
      if (requestedStatus && status !== normalizeStatus(requestedStatus)) return;

      const occurrence = occurrenceMap.get(`${a.sessionId}-${a.occurrenceDate.toISOString()}`);
      const durationSeconds = getDurationSeconds(a, occurrence);
      formattedData.push({
        id: a.id,
        attendanceId: a.id,
        studentAttendanceId: null,
        studentId: a.studentId,
        fullName: a.student?.fullName || "Unknown",
        name: a.student?.fullName || "Unknown",
        email: a.student?.email || "N/A",
        sessionId: a.sessionId,
        courseId: a.session?.courseId,
        courseTitle: a.session?.courseTitle || a.session?.title || "Standalone Session",
        courseName: a.session?.courseTitle || a.session?.title || "Standalone Session",
        sessionTitle: a.session?.title || "Unknown Session",
        trainerId: a.session?.trainerId || null,
        trainerName: a.session?.trainer?.fullName || "Unassigned",
        studentName: a.student?.fullName || "Unknown",
        date: getDateKey(a.occurrenceDate),
        occurrenceDate: getDateKey(a.occurrenceDate),
        startsAt: occurrence?.startsAt || null,
        endsAt: occurrence?.endsAt || null,
        status,
        durationMinutes: Math.round(durationSeconds / 60),
        firstJoinedAt: a.firstJoinedAt,
        lastJoinedAt: a.lastJoinedAt,
        joinCount: a.joinCount,
        totalDurationSeconds: durationSeconds
      });
    });

    formattedData.sort((a, b) => new Date(b.date) - new Date(a.date));

    return res.status(200).json({
      success: true,
      data: {
        records: formattedData,
        items: formattedData,
      }
    });
  } catch (error) {
    console.error("Admin Get All Attendance Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch attendance records." });
  }
};

// @desc    Get session occurrences
// @route   GET /api/admin/sessions/:sessionId/occurrences
const getSessionOccurrencesAdmin = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const occurrences = await prisma.sessionOccurrence.findMany({
      where: { sessionId },
      include: {
        trainer: { select: { id: true, fullName: true, email: true } },
        session: { include: { trainer: { select: { id: true, fullName: true, email: true } } } }
      },
      orderBy: { occurrenceDate: "desc" }
    });

    const data = [];
    for (const occurrence of occurrences) {
      const roster = await buildRosterForOccurrence({
        session: occurrence.session,
        occurrence,
        date: occurrence.occurrenceDate,
      });
      data.push(formatOccurrenceRow({ occurrence, roster }));
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Admin Get Session Occurrences Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch occurrences." });
  }
};

// @desc    Get day-wise session attendance
// @route   GET /api/admin/sessions/:sessionId/attendance/:date
const getDayWiseSessionAttendance = async (req, res) => {
  try {
    const { sessionId, date } = req.params;
    const targetDate = new Date(date);
    
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid date format. Use YYYY-MM-DD" });
    }

    const session = await prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: {
        trainer: { select: { id: true, fullName: true } }
      }
    });

    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }

    const range = getDayRange(date);

    const occurrence = await prisma.sessionOccurrence.findFirst({
      where: {
        sessionId,
        occurrenceDate: {
          gte: range.start,
          lte: range.end
        }
      }
    });

    const roster = await buildRosterForOccurrence({ session, occurrence, date });
    const students = roster.students.map((row) => formatStudentRow({ row, session, occurrence }));
    const pendingCount = countPending(roster);
    const summary = buildSummary({
      totalStudents: roster.totalStudents,
      totalSessions: occurrence ? 1 : 0,
      presentCount: roster.presentCount,
      lateCount: roster.lateCount,
      absentCount: roster.absentCount,
      pendingCount,
    });

    const trainerAttendance = {
      trainerId: session?.trainerId || null,
      trainerName: session?.trainer?.fullName || "Unassigned",
      status: isOccurrenceEnded(occurrence) ? "present" : (occurrence?.status === 'live' ? "present" : "pending"),
      firstJoinedAt: isOccurrenceEnded(occurrence) ? occurrence?.startsAt || null : null,
      lastJoinedAt: isOccurrenceEnded(occurrence) ? occurrence?.endsAt || null : null,
      joinCount: isOccurrenceEnded(occurrence) ? 1 : 0,
      durationMinutes: occurrence?.startsAt && occurrence?.endsAt ? Math.round((new Date(occurrence.endsAt).getTime() - new Date(occurrence.startsAt).getTime()) / 60000) : (session?.durationMinutes || 60),
      totalDurationSeconds: occurrence?.startsAt && occurrence?.endsAt ? Math.max(0, Math.floor((new Date(occurrence.endsAt) - new Date(occurrence.startsAt)) / 1000)) : 0,
    };

    const responseData = {
      sessionId: sessionId,
      occurrenceId: occurrence?.id || null,
      date: getDateKey(targetDate),
      occurrenceDate: getDateKey(targetDate),
      sessionTitle: session?.title || session?.courseTitle || "Unknown Session",
      courseId: session?.courseId || null,
      courseTitle: session?.courseTitle || session?.title || null,
      trainerId: session?.trainerId || null,
      trainerName: session?.trainer?.fullName || null,
      startsAt: occurrence?.startsAt || null,
      endsAt: occurrence?.endsAt || null,
      summary,
      totalStudents: roster.totalStudents,
      presentCount: roster.presentCount,
      lateCount: roster.lateCount,
      absentCount: roster.absentCount,
      pendingCount,
      attendedCount: roster.attendedCount,
      attendancePercentage: summary.attendancePercentage,
      trainerAttendance,
      students
    };

    return res.status(200).json({ success: true, data: responseData });
  } catch (error) {
    console.error("Admin Get Day Wise Session Attendance Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch day-wise session attendance." });
  }
};

// @desc    Grouped course-first admin attendance list
// @route   GET /api/admin/attendance/courses/grouped
const getGroupedAttendanceCourses = async (req, res) => {
  try {
    const { search, status } = req.query;
    const sessions = await prisma.liveSession.findMany({
      where: buildSessionFilter(),
      include: {
        trainer: { select: { id: true, fullName: true, email: true } },
        occurrences: { orderBy: { occurrenceDate: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    const grouped = new Map();
    sessions.forEach((session) => {
      const key = getCourseKey(session);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(session);
    });

    let courses = [];
    for (const groupedSessions of grouped.values()) {
      courses.push(await buildCourseSummaryFromSessions(groupedSessions));
    }

    if (search) {
      const needle = String(search).toLowerCase();
      courses = courses.filter((course) =>
        [course.courseTitle, course.trainerName, course.trainerEmail]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle))
      );
    }

    if (status) {
      courses = courses.filter((course) => course.status === status);
    }

    const responseSummary = buildSummary({
      totalStudents: courses.reduce((sum, course) => sum + (course.totalStudents || 0), 0),
      totalTrainers: new Set(courses.map((course) => course.trainerId).filter(Boolean)).size,
      totalSessions: courses.reduce((sum, course) => sum + (course.totalSessions || 0), 0),
      presentCount: courses.reduce((sum, course) => sum + (course.presentCount || 0), 0),
      lateCount: courses.reduce((sum, course) => sum + (course.lateCount || 0), 0),
      absentCount: courses.reduce((sum, course) => sum + (course.absentCount || 0), 0),
      pendingCount: courses.reduce((sum, course) => sum + (course.pendingCount || 0), 0),
    });

    return res.status(200).json({
      success: true,
      data: {
        summary: responseSummary,
        courses,
        items: courses,
      },
    });
  } catch (error) {
    console.error("Grouped Admin Attendance Courses Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch grouped course attendance." });
  }
};

// @desc    Grouped one-course attendance with date/occurrence rows
// @route   GET /api/admin/attendance/courses/:courseKey/grouped
const getGroupedCourseAttendance = async (req, res) => {
  try {
    const { courseKey } = req.params;
    const sessions = await getSessionsForCourseKey(courseKey);

    if (sessions.length === 0) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    const course = await buildCourseSummaryFromSessions(sessions);
    return res.status(200).json({
      success: true,
      data: {
        course: { ...course, occurrences: undefined },
        occurrences: course.occurrences,
        items: course.occurrences,
      },
    });
  } catch (error) {
    console.error("Grouped Admin Course Attendance Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch grouped course attendance detail." });
  }
};

// @desc    Grouped one-course one-date attendance split into student and trainer sections
// @route   GET /api/admin/attendance/courses/:courseKey/dates/:date
const getGroupedCourseDateAttendance = async (req, res) => {
  try {
    const { courseKey, date } = req.params;
    const range = getDayRange(date);

    if (!range) {
      return res.status(400).json({ success: false, message: "Invalid date format. Use YYYY-MM-DD." });
    }

    const sessions = await getSessionsForCourseKey(courseKey);
    if (sessions.length === 0) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    const sessionIds = sessions.map((session) => session.id);
    const occurrences = await prisma.sessionOccurrence.findMany({
      where: {
        sessionId: { in: sessionIds },
        occurrenceDate: { gte: range.start, lte: range.end },
      },
      include: {
        trainer: { select: { id: true, fullName: true, email: true } },
        session: { include: { trainer: { select: { id: true, fullName: true, email: true } } } },
      },
      orderBy: { startsAt: "asc" },
    });

    const studentAttendance = [];
    const trainerAttendance = [];
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let pendingCount = 0;
    const studentSet = new Set();

    for (const occurrence of occurrences) {
      const session = occurrence.session || sessions.find((item) => item.id === occurrence.sessionId);
      const roster = await buildRosterForOccurrence({ session, occurrence, date });
      presentCount += roster.presentCount;
      lateCount += roster.lateCount;
      absentCount += roster.absentCount;
      pendingCount += countPending(roster);
      roster.students.forEach((row) => {
        studentSet.add(row.studentId);
        studentAttendance.push({
          ...formatStudentRow({ row, session, occurrence }),
          occurrenceId: occurrence.id,
          sessionTitle: session?.title || "Unknown Session",
          courseTitle: getCourseTitle(session),
          source: row.source || null,
        });
      });
      trainerAttendance.push({
        occurrenceId: occurrence.id,
        sessionId: occurrence.sessionId,
        sessionTitle: session?.title || "Unknown Session",
        courseTitle: getCourseTitle(session),
        date: getDateKey(occurrence.occurrenceDate),
        startsAt: occurrence.startsAt,
        endsAt: occurrence.endsAt,
        runtimeStatus: getOccurrenceRuntimeStatus(occurrence),
        ...buildTrainerAttendanceFromOccurrence(occurrence, session),
      });
    }

    const firstSession = sessions[0];
    const summary = buildSummary({
      totalStudents: studentSet.size,
      totalSessions: occurrences.length,
      presentCount,
      lateCount,
      absentCount,
      pendingCount,
    });

    return res.status(200).json({
      success: true,
      data: {
        course: {
          courseKey: getCourseKey(firstSession),
          courseId: firstSession.courseId || null,
          courseTitle: getCourseTitle(firstSession),
          trainerId: firstSession.trainerId,
          trainerName: firstSession.trainer?.fullName || "Unassigned",
        },
        date: getDateKey(range.start),
        summary,
        occurrences: occurrences.map((occurrence) => ({
          id: occurrence.id,
          occurrenceId: occurrence.id,
          sessionId: occurrence.sessionId,
          sessionTitle: occurrence.session?.title || "Unknown Session",
          date: getDateKey(occurrence.occurrenceDate),
          startsAt: occurrence.startsAt,
          endsAt: occurrence.endsAt,
          runtimeStatus: getOccurrenceRuntimeStatus(occurrence),
        })),
        studentAttendance,
        trainerAttendance,
      },
    });
  } catch (error) {
    console.error("Grouped Admin Course Date Attendance Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch grouped date attendance." });
  }
};

// @desc    Student-first grouped attendance for admin
// @route   GET /api/admin/attendance/students/:studentId/grouped
const getGroupedStudentAttendance = async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId, 10);
    if (!Number.isInteger(studentId)) {
      return res.status(400).json({ success: false, message: "Invalid studentId." });
    }

    const student = await prisma.user.findFirst({
      where: { id: studentId, role: "STUDENT" },
      select: { id: true, fullName: true, email: true, phoneNumber: true },
    });

    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found." });
    }

    const attendances = await prisma.studentAttendance.findMany({
      where: { studentId, session: buildSessionFilter() },
      include: {
        session: { include: { trainer: { select: { id: true, fullName: true, email: true } } } },
        occurrence: true,
      },
      orderBy: { occurrenceDate: "desc" },
    });

    const legacyAttendances = await prisma.attendance.findMany({
      where: { studentId, session: buildSessionFilter() },
      include: { session: true, events: true },
    });
    const legacyByKey = new Map(legacyAttendances.map((row) => [`${row.sessionId}-${row.occurrenceDate.toISOString()}`, row]));

    const courseMap = new Map();
    attendances.forEach((attendance) => {
      const session = attendance.session;
      const key = getCourseKey(session);
      if (!courseMap.has(key)) {
        courseMap.set(key, {
          courseKey: key,
          courseId: session?.courseId || null,
          courseTitle: getCourseTitle(session),
          trainerId: session?.trainerId || null,
          trainerName: session?.trainer?.fullName || "Unassigned",
          records: [],
        });
      }
      const legacy = legacyByKey.get(`${attendance.sessionId}-${attendance.occurrenceDate.toISOString()}`);
      const durationSeconds = getDurationSeconds(legacy, attendance.occurrence);
      courseMap.get(key).records.push({
        attendanceId: legacy?.id || attendance.id,
        studentAttendanceId: attendance.id,
        sessionId: attendance.sessionId,
        sessionTitle: session?.title || "Unknown Session",
        occurrenceId: attendance.occurrenceId,
        date: getDateKey(attendance.occurrenceDate),
        startsAt: attendance.occurrence?.startsAt || null,
        endsAt: attendance.occurrence?.endsAt || null,
        status: normalizeStatus(attendance.status),
        source: attendance.source || null,
        firstJoinedAt: attendance.firstJoinedAt,
        lastJoinedAt: attendance.lastJoinedAt,
        joinCount: attendance.joinCount,
        totalDurationSeconds: durationSeconds,
        durationMinutes: Math.round(durationSeconds / 60),
      });
    });

    const courses = Array.from(courseMap.values()).map((course) => {
      const presentCount = course.records.filter((record) => record.status === "present").length;
      const lateCount = course.records.filter((record) => record.status === "late").length;
      const absentCount = course.records.filter((record) => record.status === "absent").length;
      const pendingCount = course.records.filter((record) => record.status === "pending").length;
      return {
        ...course,
        summary: buildSummary({
          totalSessions: course.records.length,
          presentCount,
          lateCount,
          absentCount,
          pendingCount,
        }),
      };
    });

    const allRecords = courses.flatMap((course) => course.records);
    const summary = buildSummary({
      totalSessions: allRecords.length,
      presentCount: allRecords.filter((record) => record.status === "present").length,
      lateCount: allRecords.filter((record) => record.status === "late").length,
      absentCount: allRecords.filter((record) => record.status === "absent").length,
      pendingCount: allRecords.filter((record) => record.status === "pending").length,
    });

    return res.status(200).json({
      success: true,
      data: {
        student,
        summary,
        courses,
        records: allRecords,
      },
    });
  } catch (error) {
    console.error("Grouped Admin Student Attendance Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch grouped student attendance." });
  }
};

// @desc    Trainer-first grouped attendance for admin
// @route   GET /api/admin/attendance/trainers/:trainerId/grouped
const getGroupedTrainerAttendance = async (req, res) => {
  try {
    const trainerId = parseInt(req.params.trainerId, 10);
    if (!Number.isInteger(trainerId)) {
      return res.status(400).json({ success: false, message: "Invalid trainerId." });
    }

    const trainer = await prisma.user.findFirst({
      where: { id: trainerId, role: "TRAINER" },
      select: { id: true, fullName: true, email: true, phoneNumber: true },
    });

    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer not found." });
    }

    const sessions = await prisma.liveSession.findMany({
      where: buildSessionFilter({ trainerId }),
      include: {
        trainer: { select: { id: true, fullName: true, email: true } },
        occurrences: { orderBy: { occurrenceDate: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    const grouped = new Map();
    sessions.forEach((session) => {
      const key = getCourseKey(session);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(session);
    });

    const courses = [];
    for (const groupedSessions of grouped.values()) {
      const course = await buildCourseSummaryFromSessions(groupedSessions);
      courses.push({
        ...course,
        trainerRecords: course.occurrences.map((occurrence) => ({
          occurrenceId: occurrence.occurrenceId,
          sessionId: occurrence.sessionId,
          sessionTitle: occurrence.sessionTitle,
          courseTitle: occurrence.courseTitle,
          date: occurrence.date,
          startsAt: occurrence.startsAt,
          endsAt: occurrence.endsAt,
          runtimeStatus: occurrence.runtimeStatus,
          ...occurrence.trainerAttendance,
        })),
      });
    }

    const trainerRecords = courses.flatMap((course) => course.trainerRecords);
    const presentCount = trainerRecords.filter((record) => record.status === "present").length;
    const pendingCount = trainerRecords.filter((record) => record.status === "pending").length;
    const summary = buildSummary({
      totalSessions: trainerRecords.length,
      presentCount,
      pendingCount,
    });

    return res.status(200).json({
      success: true,
      data: {
        trainer,
        summary,
        courses,
        records: trainerRecords,
      },
    });
  } catch (error) {
    console.error("Grouped Admin Trainer Attendance Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch grouped trainer attendance." });
  }
};

const buildTITSessionFilter = (extra = {}) => ({
  status: { not: "deleted" },
  OR: [
    { sectionType: "TIT" },
    { sessionType: "TIT" },
    { source: "admin_tit_classes" },
  ],
  ...extra,
});

const getTITSessionsForCourseKey = async (courseKey) => {
  if (!courseKey) return [];

  const where = isStandaloneCourseKey(courseKey)
    ? buildTITSessionFilter({ id: getSessionIdFromCourseKey(courseKey) })
    : buildTITSessionFilter({ courseId: courseKey });

  return prisma.liveSession.findMany({
    where,
    include: {
      trainer: { select: { id: true, fullName: true, email: true } },
      occurrences: {
        orderBy: { occurrenceDate: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
};

// @desc    Grouped TIT-first admin attendance list
// @route   GET /api/admin/attendance/tit/grouped
const getGroupedAttendanceTIT = async (req, res) => {
  try {
    const { search, status } = req.query;
    const sessions = await prisma.liveSession.findMany({
      where: buildTITSessionFilter(),
      include: {
        trainer: { select: { id: true, fullName: true, email: true } },
        occurrences: { orderBy: { occurrenceDate: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    const grouped = new Map();
    sessions.forEach((session) => {
      const key = getTITCourseKey(session);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(session);
    });

    let courses = [];
    for (const groupedSessions of grouped.values()) {
      courses.push(await buildCourseSummaryFromSessions(groupedSessions));
    }

    if (search) {
      const needle = String(search).toLowerCase();
      courses = courses.filter((course) =>
        [course.courseTitle, course.trainerName, course.trainerEmail]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle))
      );
    }

    if (status) {
      courses = courses.filter((course) => course.status === status);
    }

    const responseSummary = buildSummary({
      totalStudents: courses.reduce((sum, course) => sum + (course.totalStudents || 0), 0),
      totalTrainers: new Set(courses.map((course) => course.trainerId).filter(Boolean)).size,
      totalSessions: courses.reduce((sum, course) => sum + (course.totalSessions || 0), 0),
      presentCount: courses.reduce((sum, course) => sum + (course.presentCount || 0), 0),
      lateCount: courses.reduce((sum, course) => sum + (course.lateCount || 0), 0),
      absentCount: courses.reduce((sum, course) => sum + (course.absentCount || 0), 0),
      pendingCount: courses.reduce((sum, course) => sum + (course.pendingCount || 0), 0),
    });

    return res.status(200).json({
      success: true,
      data: {
        summary: responseSummary,
        courses,
        items: courses,
      },
    });
  } catch (error) {
    console.error("Grouped Admin Attendance TIT Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch grouped TIT attendance." });
  }
};

// @desc    Grouped one-TIT-class attendance with date/occurrence rows
// @route   GET /api/admin/attendance/tit/:courseKey/grouped
const getGroupedTITCourseAttendance = async (req, res) => {
  try {
    const { courseKey } = req.params;
    const sessions = await getTITSessionsForCourseKey(courseKey);

    if (sessions.length === 0) {
      return res.status(404).json({ success: false, message: "TIT Class not found." });
    }

    const course = await buildCourseSummaryFromSessions(sessions);
    return res.status(200).json({
      success: true,
      data: {
        course: { ...course, occurrences: undefined },
        occurrences: course.occurrences,
        items: course.occurrences,
      },
    });
  } catch (error) {
    console.error("Grouped Admin TIT Class Attendance Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch grouped TIT class attendance detail." });
  }
};

// @desc    Grouped one-TIT-class one-date attendance split into student and trainer sections
// @route   GET /api/admin/attendance/tit/:courseKey/dates/:date
const getGroupedTITCourseDateAttendance = async (req, res) => {
  try {
    const { courseKey, date } = req.params;
    const range = getDayRange(date);

    if (!range) {
      return res.status(400).json({ success: false, message: "Invalid date format. Use YYYY-MM-DD." });
    }

    const sessions = await getTITSessionsForCourseKey(courseKey);
    if (sessions.length === 0) {
      return res.status(404).json({ success: false, message: "TIT Class not found." });
    }

    const sessionIds = sessions.map((session) => session.id);
    const occurrences = await prisma.sessionOccurrence.findMany({
      where: {
        sessionId: { in: sessionIds },
        occurrenceDate: { gte: range.start, lte: range.end },
      },
      include: {
        trainer: { select: { id: true, fullName: true, email: true } },
        session: { include: { trainer: { select: { id: true, fullName: true, email: true } } } },
      },
      orderBy: { startsAt: "asc" },
    });

    const studentAttendance = [];
    const trainerAttendance = [];
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let pendingCount = 0;
    const studentSet = new Set();

    for (const occurrence of occurrences) {
      const session = occurrence.session || sessions.find((item) => item.id === occurrence.sessionId);
      const roster = await buildRosterForOccurrence({ session, occurrence, date });
      presentCount += roster.presentCount;
      lateCount += roster.lateCount;
      absentCount += roster.absentCount;
      pendingCount += countPending(roster);
      roster.students.forEach((row) => {
        studentSet.add(row.studentId);
        studentAttendance.push({
          ...formatStudentRow({ row, session, occurrence }),
          occurrenceId: occurrence.id,
          sessionTitle: session?.title || "Unknown Session",
          courseTitle: getCourseTitle(session),
          source: row.source || null,
        });
      });
      trainerAttendance.push({
        occurrenceId: occurrence.id,
        sessionId: occurrence.sessionId,
        sessionTitle: session?.title || "Unknown Session",
        courseTitle: getCourseTitle(session),
        date: getDateKey(occurrence.occurrenceDate),
        startsAt: occurrence.startsAt,
        endsAt: occurrence.endsAt,
        runtimeStatus: getOccurrenceRuntimeStatus(occurrence),
        ...buildTrainerAttendanceFromOccurrence(occurrence, session),
      });
    }

    const firstSession = sessions[0];
    const summary = buildSummary({
      totalStudents: studentSet.size,
      totalSessions: occurrences.length,
      presentCount,
      lateCount,
      absentCount,
      pendingCount,
    });

    return res.status(200).json({
      success: true,
      data: {
        course: {
          courseKey: getTITCourseKey(firstSession),
          courseId: firstSession.courseId || null,
          courseTitle: getCourseTitle(firstSession),
          trainerId: firstSession.trainerId,
          trainerName: firstSession.trainer?.fullName || "Unassigned",
          trainerEmail: firstSession.trainer?.email || null,
        },
        date: getDateKey(range.start),
        summary,
        occurrences: occurrences.map((occurrence) => ({
          id: occurrence.id,
          occurrenceId: occurrence.id,
          sessionId: occurrence.sessionId,
          sessionTitle: occurrence.session?.title || "Unknown Session",
          date: getDateKey(occurrence.occurrenceDate),
          startsAt: occurrence.startsAt,
          endsAt: occurrence.endsAt,
          runtimeStatus: getOccurrenceRuntimeStatus(occurrence),
        })),
        studentAttendance,
        trainerAttendance,
      },
    });
  } catch (error) {
    console.error("Grouped Admin TIT Course Date Attendance Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch grouped TIT course attendance date details." });
  }
};

module.exports = {
  getAttendanceOverview,
  getAllAttendanceRecords,
  getTrainerAttendanceAdmin,
  getAllCoursesAttendance,
  getCourseAttendanceSummaryAdmin,
  getSessionAttendanceAdmin,
  getStudentAttendanceAdmin,
  updateAttendanceRecord,
  getSessionOccurrencesAdmin,
  getDayWiseSessionAttendance,
  getGroupedAttendanceCourses,
  getGroupedCourseAttendance,
  getGroupedCourseDateAttendance,
  getGroupedStudentAttendance,
  getGroupedTrainerAttendance,
  getGroupedAttendanceTIT,
  getGroupedTITCourseAttendance,
  getGroupedTITCourseDateAttendance,
};
