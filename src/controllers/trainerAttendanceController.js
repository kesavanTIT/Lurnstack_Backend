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
    const { date } = req.query;
    const trainerId = parseInt(req.user.id);

    const session = await prisma.liveSession.findUnique({
      where: { id: sessionId }
    });

    if (!session || session.trainerId !== trainerId) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const whereClause = { sessionId };
    if (date) {
      if (date === 'last_week') {
        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);
        whereClause.occurrenceDate = { gte: lastWeek };
      } else {
        whereClause.occurrenceDate = new Date(`${date}T00:00:00.000Z`);
      }
    }

    const attendances = await prisma.attendance.findMany({
      where: whereClause,
      include: { 
        student: { select: { id: true, fullName: true, email: true } },
        events: { orderBy: { joinedAt: "asc" } }
      },
      orderBy: { joinedAt: "desc" }
    });

    const totalBookings = await prisma.sessionBooking.count({
      where: { sessionId }
    });

    const totalStudents = Math.max(totalBookings, attendances.length);
    const presentCount = attendances.length;
    const lateCount = 0;
    const absentCount = totalStudents - presentCount;
    const attendedCount = presentCount;
    const attendancePercentage = totalStudents > 0 ? parseFloat(((presentCount / totalStudents) * 100).toFixed(2)) : 0;

    const formattedStudents = attendances.map(a => {
      let joinCount = 1;
      let lastJoinedAt = a.joinedAt;
      let lastLeftAt = null;
      let durationSeconds = a.totalDurationSeconds || 0;
      
      if (a.events && a.events.length > 0) {
        joinCount = a.events.length;
        const lastEvent = a.events[a.events.length - 1];
        lastJoinedAt = lastEvent.joinedAt;
        lastLeftAt = lastEvent.leftAt;
        
        if (durationSeconds === 0) {
           for (const ev of a.events) {
             if (ev.joinedAt && ev.leftAt) {
               durationSeconds += Math.max(0, Math.floor((new Date(ev.leftAt) - new Date(ev.joinedAt))/1000));
             }
           }
        }
      }

      return {
        attendanceId: a.id,
        studentId: a.studentId,
        fullName: a.student?.fullName || "Unknown",
        email: a.student?.email || "N/A",
        status: a.status,
        firstJoinedAt: a.joinedAt,
        lastJoinedAt,
        leftAt: lastLeftAt,
        joinCount,
        durationSeconds
      };
    });

    let scheduledAt = session.createdAt;
    let endedAt = null;
    const baseDate = (date && date !== 'last_week') ? date : new Date().toISOString().slice(0, 10);
    if (session.startTime) {
      try { scheduledAt = new Date(`${baseDate}T${session.startTime}:00+05:30`).toISOString(); } catch(e) {}
    }
    if (session.endTime) {
      try { endedAt = new Date(`${baseDate}T${session.endTime}:00+05:30`).toISOString(); } catch(e) {}
    }

    return res.status(200).json({
      success: true,
      data: {
        sessionId: session.id,
        sessionTitle: session.title || "Live Session",
        scheduledAt,
        endedAt,
        totalStudents,
        presentCount,
        lateCount,
        absentCount,
        attendedCount,
        attendancePercentage,
        students: formattedStudents
      }
    });
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
      where: { 
        trainerId,
        OR: [
          { courseId: courseId },
          { sessionId: courseId }
        ]
      },
      include: { 
        student: { select: { id: true, fullName: true, email: true } }
      },
      orderBy: { occurrenceDate: "desc" }
    });

    // Safely fetch occurrences
    const occurrenceIds = attendances.map(a => a.occurrenceId).filter(Boolean);
    const occurrences = await prisma.sessionOccurrence.findMany({
      where: { id: { in: occurrenceIds } }
    });

    // Fetch real durations to recalculate status dynamically
    const sessionIds = [...new Set(attendances.map(a => a.sessionId).filter(Boolean))];
    const actualAttendances = await prisma.attendance.findMany({
      where: { sessionId: { in: sessionIds } }
    });

    const formattedData = attendances.map(a => {
      let finalStatus = a.status === 'joined' ? 'present' : a.status;

      // Recalculate based on 30% rule if it's currently absent
      if (finalStatus === 'absent' && a.joinCount > 0) {
        const actualAtt = actualAttendances.find(att => att.studentId === a.studentId && att.occurrenceDate?.getTime() === a.occurrenceDate?.getTime());
        if (actualAtt) {
          const occ = occurrences.find(o => o.id === a.occurrenceId);
          
          let totalSecs = actualAtt.totalDurationSeconds || 0;
          if (totalSecs === 0 && actualAtt.joinedAt) {
            const start = new Date(actualAtt.joinedAt).getTime();
            const end = occ?.endsAt ? new Date(occ.endsAt).getTime() : start + 3600000;
            if (end > start) {
              totalSecs = Math.round((end - start) / 1000);
            }
          }

          const sessionDurationMins = (occ?.startsAt && occ?.endsAt)
            ? Math.max(1, Math.round((new Date(occ.endsAt).getTime() - new Date(occ.startsAt).getTime()) / 60000))
            : 60;
          const requiredSeconds = Math.ceil(sessionDurationMins * 60 * 0.30);

          if (totalSecs >= requiredSeconds) {
            finalStatus = 'present';
          }
        }
      }

      return {
        ...a,
        status: finalStatus
      };
    });

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
      where: { 
        trainerId,
        OR: [
          { courseId: courseId },
          { sessionId: courseId }
        ]
      },
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
