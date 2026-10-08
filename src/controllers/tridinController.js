const prisma = require("../config/db");
const bcrypt = require("bcryptjs");

// ─────────────────────────────────────────────
// @desc    Get all Tridin-only courses/sessions
// @route   GET /api/tridin/courses
// @access  Private (TRIDIN_CANDIDATE only)
// ─────────────────────────────────────────────
const getTridinCourses = async (req, res) => {
  try {
    const sessions = await prisma.liveSession.findMany({
      where: {
        isTridinOnly: true,
        publishState: "PUBLISHED",
      },
      select: {
        id: true,
        title: true,
        subtitle: true,
        description: true,
        category: true,
        courseTitle: true,
        thumbnail: true,
        startTime: true,
        endTime: true,
        scheduledDate: true,
        scheduledAt: true,
        isRecurring: true,
        recurrenceType: true,
        recurringDays: true,
        status: true,
        meetingLink: true,
        totalHours: true,
        totalDays: true,
        durationMinutes: true,
        recordingUrl: true,
        materials: true,
        pricingState: true,
        publishState: true,
        createdAt: true,
        trainer: {
          select: {
            id: true,
            fullName: true,
            profilePhotoUrl: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const formattedCourses = sessions.map((s) => ({
      ...s,
      meetUrl: s.meetingLink || "",
      instructorName: s.trainer?.fullName || "LurnStack Trainer",
      instructor: s.trainer?.fullName || "LurnStack Trainer",
    }));

    return res.status(200).json({
      success: true,
      message: "Tridin courses fetched successfully",
      courses: formattedCourses,
      data: formattedCourses,
      count: formattedCourses.length,
    });
  } catch (error) {
    console.error("getTridinCourses error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch Tridin courses",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Get Tridin candidate's own profile
// @route   GET /api/tridin/me
// @access  Private (TRIDIN_CANDIDATE only)
// ─────────────────────────────────────────────
const getTridinProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        role: true,
        profilePhotoUrl: true,
        createdAt: true,
      },
    });

    if (!user || user.role !== "TRIDIN_CANDIDATE") {
      return res.status(404).json({
        success: false,
        message: "Tridin candidate profile not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile fetched successfully",
      data: user,
    });
  } catch (error) {
    console.error("getTridinProfile error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch profile",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Admin: Create a Tridin candidate
// @route   POST /api/admin/tridin/candidates
// @access  Private (ADMIN only)
// ─────────────────────────────────────────────
const createTridinCandidate = async (req, res) => {
  try {
    const { fullName, email, password, phoneNumber } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide fullName, email, and password.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if email already exists
    const existing = await prisma.user.findFirst({
      where: {
        email: { equals: normalizedEmail, mode: "insensitive" },
      },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "A user with this email already exists.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const candidate = await prisma.user.create({
      data: {
        fullName: fullName.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        phoneNumber: phoneNumber ? phoneNumber.trim() : null,
        role: "TRIDIN_CANDIDATE",
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        role: true,
        createdAt: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Tridin candidate created successfully",
      data: candidate,
    });
  } catch (error) {
    console.error("createTridinCandidate error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create Tridin candidate",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Admin: List all Tridin candidates
// @route   GET /api/admin/tridin/candidates
// @access  Private (ADMIN only)
// ─────────────────────────────────────────────
const listTridinCandidates = async (req, res) => {
  try {
    const candidates = await prisma.user.findMany({
      where: { role: "TRIDIN_CANDIDATE" },
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      success: true,
      message: "Tridin candidates fetched successfully",
      data: candidates,
      count: candidates.length,
    });
  } catch (error) {
    console.error("listTridinCandidates error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch candidates",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Admin: Delete a Tridin candidate
// @route   DELETE /api/admin/tridin/candidates/:id
// @access  Private (ADMIN only)
// ─────────────────────────────────────────────
const deleteTridinCandidate = async (req, res) => {
  try {
    const { id } = req.params;
    const candidateId = parseInt(id, 10);

    if (isNaN(candidateId)) {
      return res.status(400).json({ success: false, message: "Invalid candidate ID." });
    }

    const candidate = await prisma.user.findUnique({
      where: { id: candidateId },
    });

    if (!candidate || candidate.role !== "TRIDIN_CANDIDATE") {
      return res.status(404).json({
        success: false,
        message: "Tridin candidate not found.",
      });
    }

    await prisma.user.delete({ where: { id: candidateId } });

    return res.status(200).json({
      success: true,
      message: "Tridin candidate deleted successfully.",
    });
  } catch (error) {
    console.error("deleteTridinCandidate error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete candidate",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Admin: Toggle isTridinOnly on a session
// @route   PATCH /api/admin/tridin/sessions/:id
// @access  Private (ADMIN only)
// ─────────────────────────────────────────────
const toggleTridinSession = async (req, res) => {
  try {
    const { id } = req.params;
    const { isTridinOnly } = req.body;

    const session = await prisma.liveSession.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found." });
    }

    const updated = await prisma.liveSession.update({
      where: { id },
      data: { isTridinOnly: Boolean(isTridinOnly) },
      select: { id: true, title: true, isTridinOnly: true },
    });

    return res.status(200).json({
      success: true,
      message: `Session marked as ${updated.isTridinOnly ? "Tridin Only" : "Public"}`,
      data: updated,
    });
  } catch (error) {
    console.error("toggleTridinSession error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update session",
      error: error.message,
    });
  }
};

module.exports = {
  getTridinCourses,
  getTridinProfile,
  createTridinCandidate,
  listTridinCandidates,
  deleteTridinCandidate,
  toggleTridinSession,
};
