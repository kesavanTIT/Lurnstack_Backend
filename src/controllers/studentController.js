const prisma = require("../config/db");

// ─────────────────────────────────────────────────────────────────────────────
// TIMEZONE & STATUS HELPERS (Asia/Kolkata)
// ─────────────────────────────────────────────────────────────────────────────

// Helper to get today's date string in Asia/Kolkata timezone (format: YYYY-MM-DD)
const getKolkataDateString = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
};

// Helper to calculate session status dynamically based on current server time
const calculateSessionStatus = (session, now = new Date()) => {
  if (session.status === "paused") {
    return "paused";
  }
  if (session.status === "ended") {
    return "ended";
  }

  const timezone = session.timezone || "Asia/Kolkata";
  const todayStr = getKolkataDateString(now);

  // Check if session is cancelled for today
  if (session.cancelledDates && session.cancelledDates.includes(todayStr)) {
    return "cancelled";
  }

  // Get current minutes since midnight in Asia/Kolkata
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const timeStr = timeFormatter.format(now);
  const [currentHours, currentMinutes] = timeStr.split(":").map(Number);
  const currentTotalMinutes = currentHours * 60 + currentMinutes;

  // Parse session start and end times (HH:MM)
  const [startHours, startMinutes] = session.startTime.split(":").map(Number);
  const [endHours, endMinutes] = session.endTime.split(":").map(Number);
  const startTotalMinutes = startHours * 60 + startMinutes;
  const endTotalMinutes = endHours * 60 + endMinutes;

  const joinOpenMinutes = startTotalMinutes - 5;

  // For non-recurring sessions, check if today is the day of creation
  if (!session.isRecurring) {
    const createdDateStr = getKolkataDateString(new Date(session.createdAt));
    if (todayStr < createdDateStr) {
      return "upcoming";
    }
    if (todayStr > createdDateStr) {
      return "completed_today";
    }
  }

  // Calculate status
  if (currentTotalMinutes < joinOpenMinutes) {
    return "upcoming";
  } else if (currentTotalMinutes >= joinOpenMinutes && currentTotalMinutes < startTotalMinutes) {
    return "join_open";
  } else if (currentTotalMinutes >= startTotalMinutes && currentTotalMinutes < endTotalMinutes) {
    return "live";
  } else {
    return "completed_today";
  }
};

// ─────────────────────────────────────────────
// @desc    Get all live classes
// @route   GET /api/student/live-classes
// @access  Private (Logged-in students)
// ─────────────────────────────────────────────
const getAllLiveClasses = async (req, res) => {
  try {
    const liveClasses = await prisma.liveClass.findMany({
      orderBy: { scheduledAt: "asc" },
    });

    const now = new Date();

    const enrichedClasses = liveClasses.map((cls) => {
      const startTime = cls.scheduledAt ? new Date(cls.scheduledAt) : null;
      const duration = cls.durationMinutes || 60;
      const endTime = startTime ? new Date(startTime.getTime() + duration * 60000) : null;

      let status = "upcoming";
      if (endTime && now > endTime) {
        status = "completed";
      } else if (startTime && now > startTime && now < endTime) {
        status = "live";
      }

      return {
        ...cls,
        thumbnail: cls.thumbnail ? `${req.protocol}://${req.get("host")}/${cls.thumbnail.replace(/\\/g, "/")}` : null,
        status,
        isRecurring: cls.isRecurring,
        recurrenceType: cls.recurrenceType
      };
    });

    res.status(200).json({
      success: true,
      data: enrichedClasses,
    });

  } catch (error) {
    console.error("Get All Live Classes Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error. Failed to fetch classes.",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Get a single live class by ID
// @route   GET /api/student/live-class/:classId
// @access  Private (Logged-in students)
// ─────────────────────────────────────────────
const getLiveClassById = async (req, res) => {
  try {
    const { classId } = req.params;

    const liveClass = await prisma.liveClass.findUnique({
      where: { id: parseInt(classId) },
    });

    if (!liveClass) {
      return res.status(404).json({
        success: false,
        message: "Live class not found.",
      });
    }

    if (liveClass.thumbnail) {
      liveClass.thumbnail = `${req.protocol}://${req.get("host")}/${liveClass.thumbnail.replace(/\\/g, "/")}`;
    }

    res.status(200).json({
      success: true,
      data: {
        ...liveClass,
        isRecurring: liveClass.isRecurring,
        recurrenceType: liveClass.recurrenceType
      },
    });

  } catch (error) {
    console.error("Get Live Class By ID Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error. Failed to fetch class.",
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Join a live class (Get meet link)
// @route   POST /api/student/join-class/:classId
// @access  Private (Logged-in students)
// ─────────────────────────────────────────────
const joinLiveClass = async (req, res) => {
  try {
    const { classId } = req.params;

    const liveClass = await prisma.liveClass.findUnique({
      where: { id: parseInt(classId) },
      select: { meetLink: true },
    });

    if (!liveClass) {
      return res.status(404).json({
        success: false,
        message: "Live class not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Successfully joined the class!",
      meetLink: liveClass.meetLink,
    });
  } catch (error) {
    console.error("Join Live Class Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error. Failed to join class.",
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Get all Student Sessions (with filters)
// @route   GET /api/student/sessions
// ─────────────────────────────────────────────
const getStudentSessions = async (req, res) => {
  try {
    const { category, search, filter } = req.query;
    const studentId = parseInt(req.user.id);

    let whereClause = { status: { not: "ended" } };

    if (category) {
      whereClause.courseId = category;
    }

    if (search) {
      whereClause.title = { contains: search, mode: "insensitive" };
    }

    const sessions = await prisma.liveSession.findMany({
      where: whereClause,
      include: {
        trainer: true,
        cards: { where: { studentId } },
        attendances: { where: { studentId } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const todayStr = getKolkataDateString();
    let formattedSessions = sessions.map(session => {
      const isJoinedToday = session.attendances.some(att => att.joinDate === todayStr);
      return {
        id: session.id,
        courseId: session.courseId,
        trainerId: `trainer_${session.trainerId}`,
        trainerName: session.trainer?.fullName ?? null,
        title: session.title,
        subtitle: session.subtitle,
        description: session.description,
        startTime: session.startTime,
        endTime: session.endTime,
        timezone: session.timezone,
        meetingLink: session.meetingLink,
        isRecurring: session.isRecurring,
        recurrenceType: session.recurrenceType,
        status: calculateSessionStatus(session),
        cancelledDates: session.cancelledDates,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        isAddedToCard: session.cards.length > 0,
        isJoined: isJoinedToday
      };
    });

    if (filter) {
      formattedSessions = formattedSessions.filter(s => s.status === filter);
    }

    res.status(200).json({
      success: true,
      message: "Sessions fetched successfully",
      data: formattedSessions
    });
  } catch (error) {
    console.error("Get Student Sessions Error:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// @desc    Get Student Session Details
// @route   GET /api/student/sessions/:sessionId
// ─────────────────────────────────────────────
const getStudentSessionDetails = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const studentId = parseInt(req.user.id);

    const session = await prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: {
        trainer: true,
        cards: { where: { studentId } },
        attendances: { where: { studentId } }
      }
    });

    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found." });
    }

    const todayStr = getKolkataDateString();
    const isJoinedToday = session.attendances.some(att => att.joinDate === todayStr);

    res.status(200).json({
      success: true,
      message: "Session details fetched successfully",
      data: {
        id: session.id,
        courseId: session.courseId,
        trainer: {
          id: `trainer_${session.trainer.id}`,
          name: session.trainer.fullName,
          email: session.trainer.email,
        },
        title: session.title,
        subtitle: session.subtitle,
        description: session.description,
        startTime: session.startTime,
        endTime: session.endTime,
        timezone: session.timezone,
        meetingLink: session.meetingLink,
        isRecurring: session.isRecurring,
        recurrenceType: session.recurrenceType,
        status: calculateSessionStatus(session),
        cancelledDates: session.cancelledDates,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        isAddedToCard: session.cards.length > 0,
        isJoined: isJoinedToday
      }
    });
  } catch (error) {
    console.error("Get Student Session Details Error:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// @desc    Add Session Card
// @route   POST /api/student/sessions/:sessionId/add-card
// ─────────────────────────────────────────────
const addSessionCard = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const studentId = parseInt(req.user.id);

    const existingCard = await prisma.sessionCard.findUnique({
      where: { sessionId_studentId: { sessionId, studentId } }
    });

    if (existingCard) {
      return res.status(400).json({ success: false, message: "Already in cards." });
    }

    const card = await prisma.sessionCard.create({
      data: { sessionId, studentId }
    });

    res.status(201).json({
      success: true,
      message: "Session added to card successfully",
      data: {
        cardId: card.id,
        sessionId: card.sessionId,
        studentId: `student_${card.studentId}`
      }
    });
  } catch (error) {
    console.error("Add Session Card Error:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// @desc    Remove Session Card
// @route   DELETE /api/student/sessions/:sessionId/add-card
// ─────────────────────────────────────────────
const removeSessionCard = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const studentId = parseInt(req.user.id);

    const card = await prisma.sessionCard.findFirst({
      where: {
        OR: [
          { sessionId: sessionId },
          { id: sessionId }
        ],
        studentId: studentId
      }
    });

    if (!card) {
      return res.status(404).json({ success: false, message: "Card not found." });
    }

    await prisma.sessionCard.delete({
      where: { id: card.id }
    });

    res.status(200).json({
      success: true,
      message: "Session removed from card successfully"
    });
  } catch (error) {
    console.error("Remove Session Card Error:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// @desc    Get My Session Cards
// @route   GET /api/student/me/session-cards
// ─────────────────────────────────────────────
const getMySessionCards = async (req, res) => {
  try {
    const studentId = parseInt(req.user.id);

    const cards = await prisma.sessionCard.findMany({
      where: { studentId },
      include: {
        session: {
          include: {
            trainer: true,
            attendances: { where: { studentId } }
          }
        }
      },
      orderBy: { addedAt: 'desc' }
    });

    const todayStr = getKolkataDateString();
    const formattedCards = cards.map(card => {
      const session = card.session;
      const isJoinedToday = session.attendances.some(att => att.joinDate === todayStr);
      return {
        cardId: card.id,
        sessionId: session.id,
        courseId: session.courseId,
        title: session.title,
        subtitle: session.subtitle,
        description: session.description,
        trainerName: session.trainer?.fullName,
        startTime: session.startTime,
        endTime: session.endTime,
        timezone: session.timezone,
        meetingLink: session.meetingLink,
        isRecurring: session.isRecurring,
        recurrenceType: session.recurrenceType,
        status: calculateSessionStatus(session),
        addedAt: card.addedAt,
        isJoined: isJoinedToday
      };
    });

    res.status(200).json({
      success: true,
      message: "Session cards fetched successfully",
      data: formattedCards
    });
  } catch (error) {
    console.error("Get My Session Cards Error:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// @desc    Join Session
// @route   POST /api/student/sessions/:sessionId/join
// ─────────────────────────────────────────────
const joinSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const studentId = parseInt(req.user.id);

    const session = await prisma.liveSession.findUnique({
      where: { id: sessionId }
    });

    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found." });
    }

    // Validation safeguards
    // 1. Session is paused or ended
    if (session.status === "paused") {
      return res.status(400).json({ success: false, message: "Cannot join. Session is paused." });
    }
    if (session.status === "ended") {
      return res.status(400).json({ success: false, message: "Cannot join. Session has permanently ended." });
    }

    const todayStr = getKolkataDateString();

    // 2. Today exists in cancelledDates
    if (session.cancelledDates && session.cancelledDates.includes(todayStr)) {
      return res.status(400).json({ success: false, message: "Cannot join. Session is cancelled today." });
    }

    // 3. Time validation based on session.timezone
    const timezone = session.timezone || "Asia/Kolkata";
    const now = new Date();
    
    const timeFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const timeStr = timeFormatter.format(now);
    const [currentHours, currentMinutes] = timeStr.split(":").map(Number);
    const currentTotalMinutes = currentHours * 60 + currentMinutes;

    const [startHours, startMinutes] = session.startTime.split(":").map(Number);
    const [endHours, endMinutes] = session.endTime.split(":").map(Number);
    const startTotalMinutes = startHours * 60 + startMinutes;
    const endTotalMinutes = endHours * 60 + endMinutes;

    const joinOpenMinutes = startTotalMinutes - 5;

    // Check non-recurring session date
    if (!session.isRecurring) {
      const createdDateStr = getKolkataDateString(new Date(session.createdAt));
      if (todayStr !== createdDateStr) {
        return res.status(400).json({ success: false, message: "Cannot join. This session is not active today." });
      }
    }

    if (currentTotalMinutes < joinOpenMinutes) {
      return res.status(400).json({ success: false, message: "Cannot join yet. Join window is not open." });
    }

    if (currentTotalMinutes > endTotalMinutes) {
      return res.status(400).json({ success: false, message: "Cannot join. Session has already ended for today." });
    }

    // Create or update attendance row (composite sessionId + studentId + joinDate ensures one row per student per day)
    const attendance = await prisma.attendance.upsert({
      where: {
        sessionId_studentId_joinDate: {
          sessionId,
          studentId,
          joinDate: todayStr
        }
      },
      update: {
        status: "joined",
        joinedAt: new Date()
      },
      create: {
        sessionId,
        studentId,
        joinDate: todayStr,
        status: "joined",
        joinedAt: new Date()
      }
    });

    res.status(200).json({
      success: true,
      message: "Successfully joined the session!",
      meetLink: session.meetingLink, // Keep legacy property name in outer response if frontend references meetLink
      meetingLink: session.meetingLink,
      data: {
        attendanceId: attendance.id,
        sessionId: attendance.sessionId,
        studentId: `student_${attendance.studentId}`,
        meetingLink: session.meetingLink,
        joinDate: attendance.joinDate,
        joinedAt: attendance.joinedAt
      }
    });
  } catch (error) {
    console.error("Join Session Error:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// @desc    Get My Joined Sessions (Attendance history)
// @route   GET /api/student/me/session-bookings
// ─────────────────────────────────────────────
const getMyJoinedSessions = async (req, res) => {
  try {
    const studentId = parseInt(req.user.id);

    const attendances = await prisma.attendance.findMany({
      where: { studentId },
      include: {
        session: {
          include: { trainer: true }
        }
      },
      orderBy: { joinedAt: 'desc' }
    });

    const formattedBookings = attendances.map(att => {
      const session = att.session;
      return {
        bookingId: att.id,
        sessionId: session.id,
        courseId: session.courseId,
        title: session.title,
        subtitle: session.subtitle,
        description: session.description,
        trainerName: session.trainer?.fullName,
        startTime: session.startTime,
        endTime: session.endTime,
        timezone: session.timezone,
        meetingLink: session.meetingLink,
        status: "joined",
        joinDate: att.joinDate,
        joinedAt: att.joinedAt
      };
    });

    res.status(200).json({
      success: true,
      message: "Joined sessions fetched successfully",
      data: formattedBookings
    });
  } catch (error) {
    console.error("Get My Joined Sessions Error:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

module.exports = {
  getAllLiveClasses,
  getLiveClassById,
  joinLiveClass,
  getStudentSessions,
  getStudentSessionDetails,
  addSessionCard,
  removeSessionCard,
  getMySessionCards,
  joinSession,
  getMyJoinedSessions,
};
