const prisma = require("../config/db");

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
      data: liveClass,
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
      select: { meetLink: true }, // Only need the meet link
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

    let whereClause = { status: "published" };

    if (category) {
      whereClause.category = category;
    }

    if (search) {
      whereClause.courseTitle = { contains: search, mode: "insensitive" };
    }

    if (filter === "upcoming") {
      // Basic string comparison works because ISO 8601 strings are sortable
      whereClause.scheduledAt = { gte: new Date().toISOString() };
    }

    const sessions = await prisma.liveSession.findMany({
      where: whereClause,
      include: {
        trainer: true,
        cards: { where: { studentId } },
        bookings: { where: { studentId } }
      },
      orderBy: { scheduledAt: 'asc' }
    });

    const formattedSessions = sessions.map(session => ({
      id: session.id,
      courseTitle: session.courseTitle,
      category: session.category,
      description: session.description,
      classTitle: session.classTitle,
      thumbnail: session.thumbnail,
      trainerId: `trainer_${session.trainerId}`,
      trainerName: session.trainer?.fullName,
      scheduledDate: session.scheduledDate,
      startTime: session.startTime,
      endTime: session.endTime,
      scheduledAt: session.scheduledAt,
      endsAt: session.endsAt,
      durationMinutes: session.durationMinutes,
      status: session.status,
      isAddedToCard: session.cards.length > 0,
      isJoined: session.bookings.length > 0
    }));

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
        bookings: { where: { studentId } }
      }
    });

    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found." });
    }

    res.status(200).json({
      success: true,
      message: "Session details fetched successfully",
      data: {
        id: session.id,
        courseTitle: session.courseTitle,
        category: session.category,
        description: session.description,
        classTitle: session.classTitle,
        thumbnail: session.thumbnail,
        trainer: {
          id: `trainer_${session.trainer.id}`,
          name: session.trainer.fullName,
          email: session.trainer.email,
        },
        scheduledDate: session.scheduledDate,
        startTime: session.startTime,
        endTime: session.endTime,
        scheduledAt: session.scheduledAt,
        endsAt: session.endsAt,
        durationMinutes: session.durationMinutes,
        meetingLink: session.meetingLink,
        status: session.status,
        isAddedToCard: session.cards.length > 0,
        isJoined: session.bookings.length > 0
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

    await prisma.sessionCard.delete({
      where: { sessionId_studentId: { sessionId, studentId } }
    });

    res.status(200).json({
      success: true,
      message: "Session removed from card successfully"
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, message: "Card not found." });
    }
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
          include: { trainer: true }
        }
      },
      orderBy: { addedAt: 'desc' }
    });

    const formattedCards = cards.map(card => ({
      cardId: card.id,
      sessionId: card.session.id,
      courseTitle: card.session.courseTitle,
      classTitle: card.session.classTitle,
      category: card.session.category,
      trainerName: card.session.trainer?.fullName,
      thumbnail: card.session.thumbnail,
      scheduledAt: card.session.scheduledAt,
      endsAt: card.session.endsAt,
      durationMinutes: card.session.durationMinutes,
      status: card.session.status,
      addedAt: card.addedAt
    }));

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

    const existingBooking = await prisma.sessionBooking.findUnique({
      where: { sessionId_studentId: { sessionId, studentId } }
    });

    if (existingBooking) {
      return res.status(400).json({ success: false, message: "Already joined this session." });
    }

    const booking = await prisma.sessionBooking.create({
      data: {
        sessionId,
        studentId,
        meetingLink: session.meetingLink
      }
    });

    res.status(201).json({
      success: true,
      message: "Session joined successfully",
      data: {
        bookingId: booking.id,
        sessionId: booking.sessionId,
        studentId: `student_${booking.studentId}`,
        meetingLink: booking.meetingLink,
        joinedAt: booking.joinedAt
      }
    });
  } catch (error) {
    console.error("Join Session Error:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// @desc    Get My Joined Sessions
// @route   GET /api/student/me/session-bookings
// ─────────────────────────────────────────────
const getMyJoinedSessions = async (req, res) => {
  try {
    const studentId = parseInt(req.user.id);

    const bookings = await prisma.sessionBooking.findMany({
      where: { studentId },
      include: {
        session: {
          include: { trainer: true }
        }
      },
      orderBy: { joinedAt: 'desc' }
    });

    const formattedBookings = bookings.map(booking => ({
      bookingId: booking.id,
      sessionId: booking.session.id,
      courseTitle: booking.session.courseTitle,
      classTitle: booking.session.classTitle,
      category: booking.session.category,
      trainerName: booking.session.trainer?.fullName,
      thumbnail: booking.session.thumbnail,
      scheduledAt: booking.session.scheduledAt,
      endsAt: booking.session.endsAt,
      durationMinutes: booking.session.durationMinutes,
      meetingLink: booking.meetingLink,
      status: "joined"
    }));

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
