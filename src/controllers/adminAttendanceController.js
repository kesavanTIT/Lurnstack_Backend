const prisma = require("../config/db");

// Helper for parsing global attendance filtersSSSSSSS
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

    let coursesArray = Object.values(courseMap);
    
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
    
    const attendances = await prisma.attendance.findMany({
      where: {
        ...filter,
        session: { trainerId: parseInt(trainerId) }
      },
      include: { 
        student: { select: { id: true, fullName: true, email: true } }, 
        session: true 
      },
      orderBy: { occurrenceDate: "desc" }
    });

    const formattedData = attendances.map(a => ({
      ...a,
      status: a.status
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
    
    const attendances = await prisma.attendance.findMany({
      where: filter,
      include: { session: true }
    });

    const courseMap = {};

    attendances.forEach(a => {
      const cId = a.session?.courseId || 'unknown';
      if (!courseMap[cId]) {
        courseMap[cId] = {
          courseId: cId,
          totalAttendances: 0,
          presentCount: 0,
          lateCount: 0,
          absentCount: 0
        };
      }
      courseMap[cId].totalAttendances += 1;
      
      if (a.status === "present") courseMap[cId].presentCount += 1;
      else if (a.status === "late") courseMap[cId].lateCount += 1;
      else if (a.status === "absent") courseMap[cId].absentCount += 1;
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

    const attendances = await prisma.attendance.findMany({
      where: {
        ...filter,
        session: { courseId }
      },
      include: {
        session: { include: { trainer: { select: { id: true, fullName: true, email: true } } } }
      },
      orderBy: { occurrenceDate: "desc" }
    });

    const summaryMap = {};
    attendances.forEach(a => {
      const key = `${a.sessionId}-${a.occurrenceDate}`;
      if (!summaryMap[key]) {
        summaryMap[key] = {
          occurrenceId: key,
          sessionId: a.sessionId,
          trainer: a.session?.trainer,
          date: a.occurrenceDate,
          status: "completed",
          presentCount: 0,
          lateCount: 0,
          absentCount: 0
        };
      }
      
      if (a.status === "present") summaryMap[key].presentCount++;
      else if (a.status === "late") summaryMap[key].lateCount++;
      else if (a.status === "absent") summaryMap[key].absentCount++;
    });

    return res.status(200).json({ success: true, data: Object.values(summaryMap) });
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
      const status = a.status;
      if (status === 'present') presentCount++;
      else if (status === 'late') lateCount++;
      else if (status === 'absent') absentCount++;

      const studentData = {
        attendanceId: a.id,
        studentId: a.studentId,
        fullName: a.student?.fullName || "Unknown",
        email: a.student?.email || "N/A",
        status: status,
        firstJoinedAt: a.firstJoinedAt,
        lastJoinedAt: a.lastJoinedAt,
        joinCount: a.joinCount,
        totalDurationSeconds: a.totalDurationSeconds
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
          joinCount: 0,
          totalDurationSeconds: 0
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

    const attendances = await prisma.attendance.findMany({
      where: filter,
      include: { session: true },
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

    if (!["pending", "present", "late", "absent"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status." });
    }

    const updated = await prisma.attendance.update({
      where: { id: attendanceId },
      data: { 
        status,
        updatedAt: new Date()
      }
    });

    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error("Admin Update Attendance Error:", error);
    return res.status(500).json({ success: false, message: "Failed to update attendance." });
  }
};

// @desc    Get all attendance records
// @route   GET /api/admin/attendance
const getAllAttendanceRecords = async (req, res) => {
  try {
    const filter = buildGlobalFilters(req.query);
    
    const attendances = await prisma.attendance.findMany({
      where: filter,
      include: {
        session: { include: { trainer: { select: { id: true, fullName: true } } } },
        student: { select: { id: true, fullName: true, email: true } }
      },
      orderBy: { occurrenceDate: "desc" }
    });

    const formattedData = attendances.map(a => {
      let durationMinutes = Math.round(a.totalDurationSeconds / 60);
      return {
        id: a.id,
        date: a.occurrenceDate,
        courseName: a.session?.courseTitle || "Standalone Session",
        sessionTitle: a.session?.title || "Unknown Session",
        trainerName: a.session?.trainer?.fullName || "Unassigned",
        studentName: a.student?.fullName || "Unknown",
        status: a.status,
        durationMinutes,
        firstJoinedAt: a.firstJoinedAt,
        lastJoinedAt: a.lastJoinedAt,
        joinCount: a.joinCount,
        totalDurationSeconds: a.totalDurationSeconds
      };
    });

    return res.status(200).json({ success: true, data: formattedData });
  } catch (error) {
    console.error("Admin Get All Attendance Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch attendance records." });
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
  updateAttendanceRecord
};
