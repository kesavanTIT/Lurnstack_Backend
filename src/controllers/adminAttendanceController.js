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
    const filter = buildGlobalFilters(req.query);
    
    // Group by status to calculate metrics
    const grouped = await prisma.studentAttendance.groupBy({
      by: ['status'],
      where: filter,
      _count: {
        id: true
      }
    });
    
    let presentCount = 0, lateCount = 0, absentCount = 0;
    grouped.forEach(g => {
      if (g.status === "present") presentCount = g._count.id;
      if (g.status === "late") lateCount = g._count.id;
      if (g.status === "absent") absentCount = g._count.id;
    });
    
    const total = presentCount + lateCount + absentCount;
    const averageAttendancePercentage = total > 0 ? ((presentCount + lateCount) / total) * 100 : 0;
    
    // Get top level counts
    const totalCoursesArray = await prisma.liveSession.findMany({ distinct: ['courseId'], select: { courseId: true } });
    const totalCourses = totalCoursesArray.filter(c => c.courseId).length;
    
    const totalTrainers = await prisma.user.count({ where: { role: 'TRAINER' } });
    const totalStudents = await prisma.user.count({ where: { role: 'STUDENT' } });
    const totalSessions = await prisma.sessionOccurrence.count({ where: filter });
    
    return res.status(200).json({
      success: true,
      data: {
        totalCourses,
        totalTrainers,
        totalStudents,
        totalSessions,
        presentCount,
        lateCount,
        absentCount,
        averageAttendancePercentage: parseFloat(averageAttendancePercentage.toFixed(2))
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

    return res.status(200).json({ success: true, data: attendances });
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
        if (a.status === "present") courseMap[occ.courseId].presentCount += 1;
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
      const presentCount = occ.attendances.filter(a => a.status === "present").length;
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
    const filter = buildGlobalFilters(req.query);
    filter.sessionId = sessionId;

    const attendances = await prisma.studentAttendance.findMany({
      where: filter,
      include: { 
        student: { select: { id: true, fullName: true, email: true } }, 
        occurrence: true 
      },
      orderBy: { occurrenceDate: "desc" }
    });
    
    const formattedData = attendances.map(a => ({
      attendanceId: a.id,
      name: a.student?.fullName || "Unknown",
      email: a.student?.email || "N/A",
      firstJoinedAt: a.firstJoinedAt,
      lastJoinedAt: a.lastJoinedAt,
      joinCount: a.joinCount,
      status: a.status
    }));

    return res.status(200).json({ success: true, data: formattedData });
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
