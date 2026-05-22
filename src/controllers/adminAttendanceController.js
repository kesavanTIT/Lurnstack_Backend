const prisma = require("../config/db");

// @desc    Get attendance summary for all courses
// @route   GET /api/admin/attendance/courses
const getAllCoursesAttendance = async (req, res) => {
  try {
    const occurrences = await prisma.sessionOccurrence.findMany({
      include: {
        attendances: true
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

    const occurrences = await prisma.sessionOccurrence.findMany({
      where: { courseId },
      orderBy: { startsAt: "desc" },
      include: {
        attendances: true,
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

    const attendances = await prisma.studentAttendance.findMany({
      where: { sessionId },
      include: { 
        student: { select: { id: true, fullName: true, email: true } }, 
        occurrence: true 
      },
      orderBy: { occurrenceDate: "desc" }
    });

    return res.status(200).json({ success: true, data: attendances });
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

    const attendances = await prisma.studentAttendance.findMany({
      where: { studentId: parseInt(studentId) },
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
  getAllCoursesAttendance,
  getCourseAttendanceSummaryAdmin,
  getSessionAttendanceAdmin,
  getStudentAttendanceAdmin,
  updateAttendanceRecord
};
