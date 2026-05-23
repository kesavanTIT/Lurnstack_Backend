const prisma = require("../config/db");

// Helper for parsing global attendance filters
const buildGlobalFilters = (query) => {
  const { trainerId, courseId, studentId, status, startDate, endDate } = query;
  const filter = {};

  if (trainerId) filter.trainerId = parseInt(trainerId);
  if (courseId) filter.courseId = courseId;
  if (studentId) filter.studentId = parseInt(studentId);
  if (status) filter.status = status;

  if (startDate || endDate) {
    filter.occurrenceDate = {};
    if (startDate) filter.occurrenceDate.gte = new Date(startDate);
    if (endDate) filter.occurrenceDate.lte = new Date(endDate);
  }

  return filter;
};

// @desc    Get global overview (metrics)
// @route   GET /api/admin/attendance/overview
const getAttendanceOverview = async (req, res) => {
  try {
    const totalTrainers = await prisma.user.count({ where: { role: 'TRAINER' } });
    const totalStudents = await prisma.user.count({ where: { role: 'STUDENT' } });
    const totalSessions = await prisma.liveSession.count();
    const completedSessions = await prisma.liveSession.count({
      where: {
        OR: [
          { status: 'completed' },
          { endedAt: { not: null } }
        ]
      }
    });
    
    const allCourses = await prisma.liveSession.findMany({ distinct: ['courseId'], select: { courseId: true } });
    const totalCourses = allCourses.filter(c => c.courseId).length;

    const attendances = await prisma.attendance.findMany({
      include: {
        session: {
          include: {
            trainer: { select: { id: true, fullName: true } }
          }
        }
      }
    });

    const allSessionsFull = await prisma.liveSession.findMany({
      include: {
        trainer: { select: { id: true, fullName: true } }
      }
    });

    const bookings = await prisma.sessionBooking.findMany();

    let presentCount = 0, lateCount = 0, absentCount = 0;
    const courseMap = {};
    const allSessionsMap = {};

    allSessionsFull.forEach(s => {
      allSessionsMap[s.id] = s;
      const cId = s.courseId || "unknown";
      if (!courseMap[cId]) {
        courseMap[cId] = {
          courseId: s.courseId,
          courseTitle: s.courseTitle || "Unknown Course",
          trainerId: s.trainerId,
          trainerName: s.trainer?.fullName || "Unassigned",
          totalSessions: 0,
          completedSessions: 0,
          presentCount: 0,
          lateCount: 0,
          absentCount: 0,
          uniqueStudents: new Set()
        };
      }
      
      courseMap[cId].totalSessions++;
      if (s.status === 'completed' || s.endedAt != null) {
        courseMap[cId].completedSessions++;
      }
    });

    const attendanceSet = new Set();
    
    attendances.forEach(a => {
      attendanceSet.add(`${a.sessionId}-${a.studentId}`);
      
      const status = a.status === 'joined' ? 'present' : a.status;
      if (status === 'present') presentCount++;
      else if (status === 'late') lateCount++;
      else if (status === 'absent') absentCount++;

      const s = a.session;
      if (s) {
        const cId = s.courseId || "unknown";
        if (courseMap[cId]) {
          courseMap[cId].uniqueStudents.add(a.studentId);
          if (status === 'present') courseMap[cId].presentCount++;
          else if (status === 'late') courseMap[cId].lateCount++;
          else if (status === 'absent') courseMap[cId].absentCount++;
        }
      }
    });

    // Dynamically calculate absents from bookings if session is completed
    bookings.forEach(b => {
      const s = allSessionsMap[b.sessionId];
      const isEnded = s?.status === 'completed' || s?.endedAt != null;
      if (isEnded && !attendanceSet.has(`${b.sessionId}-${b.studentId}`)) {
        absentCount++;
        if (s) {
          const cId = s.courseId || "unknown";
          if (courseMap[cId]) {
            courseMap[cId].absentCount++;
          }
        }
      }
    });

    const attendedCount = presentCount + lateCount;
    const totalAttendances = attendedCount + absentCount;
    const averageAttendancePercentage = totalAttendances > 0 
      ? parseFloat(((attendedCount / totalAttendances) * 100).toFixed(2)) 
      : 0;

    let coursesArray = Object.values(courseMap).filter(c => c.courseId !== null && c.courseId !== "unknown");
    
    coursesArray = coursesArray.map(c => {
      const cAttended = c.presentCount + c.lateCount;
      const cTotal = cAttended + c.absentCount;
      const cPercentage = cTotal > 0 ? parseFloat(((cAttended / cTotal) * 100).toFixed(2)) : 0;
      
      return {
        courseId: c.courseId,
        courseTitle: c.courseTitle,
        trainerId: c.trainerId,
        trainerName: c.trainerName,
        totalSessions: c.totalSessions,
        completedSessions: c.completedSessions,
        presentCount: c.presentCount,
        lateCount: c.lateCount,
        absentCount: c.absentCount,
        attendedCount: cAttended,
        attendancePercentage: cPercentage
      };
    });

    if (attendances.length === 0 && bookings.length === 0) {
      coursesArray = [];
    } else {
      coursesArray = coursesArray.filter(c => (c.presentCount + c.lateCount + c.absentCount) > 0);
    }

    return res.status(200).json({
      success: true,
      data: {
        totalCourses,
        totalTrainers,
        totalStudents,
        totalSessions,
        completedSessions,
        presentCount,
        lateCount,
        absentCount,
        attendedCount,
        averageAttendancePercentage,
        courses: coursesArray
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
    const filter = buildGlobalFilters(req.query);
    filter.trainerId = parseInt(trainerId);
    
    const attendances = await prisma.studentAttendance.findMany({
      where: filter,
      include: { 
        student: { select: { id: true, fullName: true, email: true } }, 
        occurrence: true 
      },
      orderBy: { occurrenceDate: "desc" }
    });

    const formattedData = attendances.map(a => ({
      ...a,
      status: a.status === 'joined' ? 'present' : a.status
    }));

    return res.status(200).json({ success: true, data: formattedData });
  } catch (error) {
    console.error("Admin Trainer Attendance Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch trainer attendance." });
  }
};

// @desc    Get attendance summary for all courses
// @route   GET /api/admin/attendance/courses
const getAllCoursesAttendance = async (req, res) => {
  try {
    const filter = buildGlobalFilters(req.query);
    
    const occurrences = await prisma.sessionOccurrence.findMany({
      include: {
        attendances: {
          where: filter
        }
      }
    });

    const courseMap = {};

    occurrences.forEach(occ => {
      if (!courseMap[occ.courseId]) {
        courseMap[occ.courseId] = {
          courseId: occ.courseId,
          totalOccurrences: 0,
          presentCount: 0,
          lateCount: 0,
          absentCount: 0
        };
      }
      courseMap[occ.courseId].totalOccurrences += 1;
      
      occ.attendances.forEach(a => {
        if (a.status === "present" || a.status === "joined") courseMap[occ.courseId].presentCount += 1;
        else if (a.status === "late") courseMap[occ.courseId].lateCount += 1;
        else if (a.status === "absent") courseMap[occ.courseId].absentCount += 1;
      });
    });

    return res.status(200).json({ success: true, data: Object.values(courseMap) });
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
    const filter = buildGlobalFilters(req.query);
    
    const occFilter = { courseId };
    if (filter.occurrenceDate) occFilter.occurrenceDate = filter.occurrenceDate;
    if (filter.trainerId) occFilter.trainerId = filter.trainerId;

    const occurrences = await prisma.sessionOccurrence.findMany({
      where: occFilter,
      orderBy: { startsAt: "desc" },
      include: {
        attendances: {
          where: filter
        },
        trainer: { select: { id: true, fullName: true, email: true } }
      }
    });

    const summary = occurrences.map(occ => {
      const presentCount = occ.attendances.filter(a => a.status === "present" || a.status === "joined").length;
      const lateCount = occ.attendances.filter(a => a.status === "late").length;
      const absentCount = occ.attendances.filter(a => a.status === "absent").length;
      return {
        occurrenceId: occ.id,
        sessionId: occ.sessionId,
        trainer: occ.trainer,
        date: occ.occurrenceDate,
        status: occ.status,
        presentCount,
        lateCount,
        absentCount
      };
    });

    return res.status(200).json({ success: true, data: summary });
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

    const session = await prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: {
        trainer: { select: { id: true, fullName: true } }
      }
    });

    const attendances = await prisma.attendance.findMany({
      where: { sessionId },
      include: {
        student: { select: { id: true, fullName: true, email: true } }
      }
    });

    const bookings = await prisma.sessionBooking.findMany({
      where: { sessionId },
      include: {
        student: { select: { id: true, fullName: true, email: true } }
      }
    });

    const isSessionEnded = session?.status === 'completed' || session?.endedAt != null;

    let presentCount = 0, lateCount = 0, absentCount = 0;
    
    const attendanceMap = new Map();
    const studentsArray = [];

    attendances.forEach(a => {
      const status = a.status === 'joined' ? 'present' : a.status;
      if (status === 'present') presentCount++;
      else if (status === 'late') lateCount++;
      else if (status === 'absent') absentCount++;

      const studentData = {
        attendanceId: a.id,
        studentId: a.studentId,
        fullName: a.student?.fullName || "Unknown",
        email: a.student?.email || "N/A",
        status: status,
        firstJoinedAt: a.joinedAt,
        lastJoinedAt: a.joinedAt,
        joinCount: 1
      };
      
      attendanceMap.set(a.studentId, studentData);
      studentsArray.push(studentData);
    });

    bookings.forEach(b => {
      if (!attendanceMap.has(b.studentId) && isSessionEnded) {
        absentCount++;
        studentsArray.push({
          attendanceId: `absent-${b.id}`,
          studentId: b.studentId,
          fullName: b.student?.fullName || "Unknown",
          email: b.student?.email || "N/A",
          status: 'absent',
          firstJoinedAt: null,
          lastJoinedAt: null,
          joinCount: 0
        });
      }
    });

    const totalStudents = Math.max(bookings.length, studentsArray.length);
    const attendedCount = presentCount + lateCount;
    const attendancePercentage = totalStudents > 0 ? parseFloat(((attendedCount / totalStudents) * 100).toFixed(2)) : 0;

    const responseData = {
      sessionId: sessionId,
      sessionTitle: session?.title || session?.courseTitle || "Unknown Session",
      courseId: session?.courseId || null,
      courseTitle: session?.courseTitle || null,
      trainerId: session?.trainerId || null,
      trainerName: session?.trainer?.fullName || null,
      totalStudents,
      presentCount,
      lateCount,
      absentCount,
      attendedCount,
      attendancePercentage,
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
      include: { occurrence: true },
      orderBy: { occurrenceDate: "desc" }
    });

    return res.status(200).json({ success: true, data: attendances });
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

    if (!["present", "late", "absent"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status." });
    }

    const updated = await prisma.studentAttendance.update({
      where: { id: attendanceId },
      data: { 
        status,
        source: "admin_manual",
        updatedAt: new Date()
      }
    });

    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error("Admin Update Attendance Error:", error);
    return res.status(500).json({ success: false, message: "Failed to update attendance." });
  }
};

module.exports = {
  getAttendanceOverview,
  getTrainerAttendanceAdmin,
  getAllCoursesAttendance,
  getCourseAttendanceSummaryAdmin,
  getSessionAttendanceAdmin,
  getStudentAttendanceAdmin,
  updateAttendanceRecord
};
