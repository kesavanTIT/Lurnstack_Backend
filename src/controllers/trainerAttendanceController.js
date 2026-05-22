const prisma = require("../config/db");

// @desc    Get attendance summary for a course
// @route   GET /api/trainer/courses/:courseId/attendance-summary
const getCourseAttendanceSummary = async (req, res) => {
  try {
    const { courseId } = req.params;
    const trainerId = parseInt(req.user.id);

    // Get all occurrences for this course that belong to the trainer
    const occurrences = await prisma.sessionOccurrence.findMany({
      where: { courseId, trainerId },
      orderBy: { startsAt: "desc" },
      include: {
        attendances: true
      }
    });

    const summary = occurrences.map(occ => {
      const presentCount = occ.attendances.filter(a => a.status === "present" || a.status === "joined").length;
      const lateCount = occ.attendances.filter(a => a.status === "late").length;
      const absentCount = occ.attendances.filter(a => a.status === "absent").length;
      return {
        occurrenceId: occ.id,
        sessionId: occ.sessionId,
        date: occ.occurrenceDate,
        status: occ.status,
        presentCount,
        lateCount,
        absentCount
      };
    });

    return res.status(200).json({ success: true, data: summary });
  } catch (error) {
    console.error("Trainer Course Attendance Summary Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch course attendance summary." });
  }
};

// @desc    Get session attendance
// @route   GET /api/trainer/sessions/:sessionId/attendance
const getSessionAttendance = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const trainerId = parseInt(req.user.id);

    const attendances = await prisma.studentAttendance.findMany({
      where: { sessionId, trainerId },
      include: { student: { select: { id: true, fullName: true, email: true } }, occurrence: true },
      orderBy: { occurrenceDate: "desc" }
    });

    const formattedData = attendances.map(a => ({
      attendanceId: a.id,
      name: a.student?.fullName || "Unknown",
      email: a.student?.email || "N/A",
      firstJoinedAt: a.firstJoinedAt,
      lastJoinedAt: a.lastJoinedAt,
      joinCount: a.joinCount,
      status: a.status === 'joined' ? 'present' : a.status
    }));

    return res.status(200).json({ success: true, data: formattedData });
  } catch (error) {
    console.error("Trainer Session Attendance Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch session attendance." });
  }
};

// @desc    Get student attendance history in a course
// @route   GET /api/trainer/courses/:courseId/student-attendance
const getStudentAttendanceInCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const trainerId = parseInt(req.user.id);

    const attendances = await prisma.studentAttendance.findMany({
      where: { courseId, trainerId },
      include: { student: { select: { id: true, fullName: true, email: true } } },
      orderBy: { occurrenceDate: "desc" }
    });

    const formattedData = attendances.map(a => ({
      ...a,
      status: a.status === 'joined' ? 'present' : a.status
    }));

    return res.status(200).json({ success: true, data: formattedData });
  } catch (error) {
    console.error("Trainer Student Attendance In Course Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch student attendance." });
  }
};

// @desc    Get attendance eligibility (for certificates)
// @route   GET /api/trainer/courses/:courseId/attendance-eligibility
const getAttendanceEligibility = async (req, res) => {
  try {
    const { courseId } = req.params;
    const trainerId = parseInt(req.user.id);

    // Calculate percentage of present/late vs total occurrences per student
    const attendances = await prisma.studentAttendance.findMany({
      where: { courseId, trainerId },
      include: { student: { select: { id: true, fullName: true, email: true } } }
    });

    const studentMap = {};
    attendances.forEach(a => {
      if (!studentMap[a.studentId]) {
        studentMap[a.studentId] = {
          student: a.student,
          total: 0,
          attended: 0
        };
      }
      studentMap[a.studentId].total += 1;
      if (a.status === "present" || a.status === "joined" || a.status === "late") {
        studentMap[a.studentId].attended += 1;
      }
    });

    const eligibility = Object.values(studentMap).map(s => ({
      student: s.student,
      percentage: s.total > 0 ? (s.attended / s.total) * 100 : 0,
      isEligible: s.total > 0 && (s.attended / s.total) >= 0.75 // Assuming 75% rule
    }));

    return res.status(200).json({ success: true, data: eligibility });
  } catch (error) {
    console.error("Trainer Attendance Eligibility Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch attendance eligibility." });
  }
};

module.exports = {
  getCourseAttendanceSummary,
  getSessionAttendance,
  getStudentAttendanceInCourse,
  getAttendanceEligibility
};
