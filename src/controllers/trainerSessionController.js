const prisma = require("../config/db");

// ─────────────────────────────────────────────────────────────────────────────
// TIMEZONE HELPER
// Accepts scheduledDate ("2026-05-20"), startTime ("10:30"), endTime ("11:30")
// Returns { scheduledAt, endsAt, durationMinutes } with +05:30 (IST) offset.
// ─────────────────────────────────────────────────────────────────────────────
const buildTimestamps = (scheduledDate, startTime, endTime) => {
  const scheduledAt = `${scheduledDate}T${startTime}:00+05:30`;
  const endsAt = `${scheduledDate}T${endTime}:00+05:30`;

  // Calculate absolute delta in minutes
  const startMs = new Date(scheduledAt).getTime();
  const endMs = new Date(endsAt).getTime();
  const durationMinutes = Math.round(Math.abs(endMs - startMs) / 60000);

  return { scheduledAt, endsAt, durationMinutes };
};

// ─────────────────────────────────────────────
// Helper: build the full response shape for a session
// Joins trainer name and email from the included `trainer` relation.
// ─────────────────────────────────────────────
const formatSession = (session) => ({
  id: session.id,
  courseTitle: session.courseTitle,
  category: session.category,
  description: session.description,
  classTitle: session.classTitle,
  thumbnail: session.thumbnail,
  trainerId: `trainer_${session.trainerId}`,
  trainerName: session.trainer?.fullName ?? null,
  trainerEmail: session.trainer?.email ?? null,
  scheduledDate: session.scheduledDate,
  startTime: session.startTime,
  endTime: session.endTime,
  scheduledAt: session.scheduledAt,
  endsAt: session.endsAt,
  durationMinutes: session.durationMinutes,
  meetingLink: session.meetingLink,
  status: session.status,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
});

// ─────────────────────────────────────────────
// @desc    Create a new live session
// @route   POST /api/trainer/sessions
// @access  Private/Trainer
// ─────────────────────────────────────────────
const createSession = async (req, res) => {
  try {
    const {
      courseTitle,
      category,
      description,
      classTitle,
      thumbnail,
      scheduledDate,
      startTime,
      endTime,
      meetingLink,
    } = req.body;

    // Basic field validation
    if (
      !courseTitle ||
      !category ||
      !description ||
      !classTitle ||
      !thumbnail ||
      !scheduledDate ||
      !startTime ||
      !endTime ||
      !meetingLink
    ) {
      return res.status(400).json({
        success: false,
        message:
          "All fields are required: courseTitle, category, description, classTitle, thumbnail, scheduledDate, startTime, endTime, meetingLink.",
      });
    }

    const { scheduledAt, endsAt, durationMinutes } = buildTimestamps(
      scheduledDate,
      startTime,
      endTime
    );

    const session = await prisma.liveSession.create({
      data: {
        courseTitle,
        category,
        description,
        classTitle,
        thumbnail,
        trainerId: parseInt(req.user.id),
        scheduledDate,
        startTime,
        endTime,
        scheduledAt: new Date(scheduledAt),
        endsAt: new Date(endsAt),
        durationMinutes,
        meetingLink,
        status: "published",
      },
      include: { trainer: true },
    });

    return res.status(201).json({
      success: true,
      message: "Live class created successfully",
      data: formatSession(session),
    });
  } catch (error) {
    console.error("createSession Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to create session.",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Get all sessions for the logged-in trainer
// @route   GET /api/trainer/sessions
// @access  Private/Trainer
// ─────────────────────────────────────────────
const getTrainerSessions = async (req, res) => {
  try {
    // SECURITY: Only return sessions owned by the requesting trainer
    const sessions = await prisma.liveSession.findMany({
      where: { trainerId: parseInt(req.user.id) },
      include: { trainer: true },
      orderBy: { scheduledAt: "asc" },
    });

    return res.status(200).json({
      success: true,
      message: "Trainer sessions fetched successfully",
      data: sessions.map(formatSession),
    });
  } catch (error) {
    console.error("getTrainerSessions Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to fetch sessions.",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Get a single trainer session by ID
// @route   GET /api/trainer/sessions/:sessionId
// @access  Private/Trainer
// ─────────────────────────────────────────────
const getSingleTrainerSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: { trainer: true },
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Trainer session fetched successfully",
      data: formatSession(session),
    });
  } catch (error) {
    console.error("getSingleTrainerSession Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to fetch session.",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Update an existing trainer session (partial)
// @route   PATCH /api/trainer/sessions/:sessionId
// @access  Private/Trainer
// ─────────────────────────────────────────────
const updateTrainerSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Verify session exists
    const existing = await prisma.liveSession.findUnique({
      where: { id: sessionId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Session not found.",
      });
    }

    const {
      courseTitle,
      category,
      description,
      classTitle,
      thumbnail,
      scheduledDate,
      startTime,
      endTime,
      meetingLink,
    } = req.body;

    // Build update payload — only include fields that were sent
    const updateData = {};
    if (courseTitle !== undefined) updateData.courseTitle = courseTitle;
    if (category !== undefined) updateData.category = category;
    if (description !== undefined) updateData.description = description;
    if (classTitle !== undefined) updateData.classTitle = classTitle;
    if (thumbnail !== undefined) updateData.thumbnail = thumbnail;
    if (meetingLink !== undefined) updateData.meetingLink = meetingLink;

    // Persist raw string fields for display
    if (scheduledDate !== undefined) updateData.scheduledDate = scheduledDate;
    if (startTime !== undefined) updateData.startTime = startTime;
    if (endTime !== undefined) updateData.endTime = endTime;

    // Re-compute computed timestamp fields only when time-related data changes
    if (scheduledDate !== undefined || startTime !== undefined || endTime !== undefined) {
      const resolvedDate = scheduledDate ?? existing.scheduledDate;
      const resolvedStart = startTime ?? existing.startTime;
      const resolvedEnd = endTime ?? existing.endTime;

      const { scheduledAt, endsAt, durationMinutes } = buildTimestamps(
        resolvedDate,
        resolvedStart,
        resolvedEnd
      );

      updateData.scheduledAt = new Date(scheduledAt);
      updateData.endsAt = new Date(endsAt);
      updateData.durationMinutes = durationMinutes;
    }

    const updated = await prisma.liveSession.update({
      where: { id: sessionId },
      data: updateData,
    });

    return res.status(200).json({
      success: true,
      message: "Live class updated successfully",
      data: {
        id: updated.id,
        scheduledAt: updated.scheduledAt,
        endsAt: updated.endsAt,
        durationMinutes: updated.durationMinutes,
        status: updated.status,
      },
    });
  } catch (error) {
    console.error("updateTrainerSession Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to update session.",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Delete a trainer session by ID
// @route   DELETE /api/trainer/sessions/:sessionId
// @access  Private/Trainer
// ─────────────────────────────────────────────
const deleteTrainerSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Verify session exists before attempting deletion
    const existing = await prisma.liveSession.findUnique({
      where: { id: sessionId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Session not found.",
      });
    }

    await prisma.liveSession.delete({
      where: { id: sessionId },
    });

    return res.status(200).json({
      success: true,
      message: "Live class deleted successfully",
    });
  } catch (error) {
    console.error("deleteTrainerSession Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to delete session.",
      error: error.message,
    });
  }
};

module.exports = {
  createSession,
  getTrainerSessions,
  getSingleTrainerSession,
  updateTrainerSession,
  deleteTrainerSession,
};
