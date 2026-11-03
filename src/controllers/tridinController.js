const prisma = require("../config/db");
const bcrypt = require("bcryptjs");
const { getRelativeUploadPath } = require("../utils/pathUtils");

// ─────────────────────────────────────────────
// @desc    Get all Tridin-only courses/sessions
// @route   GET /api/tridin/courses
// @access  Private (TRIDIN_CANDIDATE only)
// ─────────────────────────────────────────────
const getTridinCourses = async (req, res) => {
  try {
    const sessions = await prisma.liveSession.findMany({
      where: {
        status: { not: "deleted" },
        deleteRequested: false,
        OR: [
          { isTridinOnly: true },
          { targetAudience: "TRIDIN" },
          { targetAudience: "BOTH" },
        ],
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
        isTridinOnly: true,
        targetAudience: true,
        createdAt: true,
        trainer: {
          select: {
            id: true,
            fullName: true,
            profilePhotoUrl: true,
          },
        },
        _count: {
          select: { tridinVideos: true },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const formattedCourses = sessions.map((s) => {
      let thumbnail = s.thumbnail || null;
      if (thumbnail && !thumbnail.startsWith("http://") && !thumbnail.startsWith("https://") && !thumbnail.startsWith("data:")) {
        const relative = getRelativeUploadPath(thumbnail);
        thumbnail = `${req.protocol}://${req.get("host")}/${relative}`;
      }

      const videoCount = s._count?.tridinVideos || 0;
      return {
        ...s,
        thumbnail,
        videoCount,
        hasVideos: videoCount > 0,
        hasMeeting: Boolean(s.meetingLink),
        meetUrl: s.meetingLink || "",
        isTridinOnly: Boolean(s.isTridinOnly),
        targetAudience: s.targetAudience || (s.isTridinOnly ? "TRIDIN" : "LURNSTACK"),
        isShared: s.targetAudience === "BOTH",
        instructorName: s.trainer?.fullName || "LurnStack Trainer",
        instructor: s.trainer?.fullName || "LurnStack Trainer",
      };
    });

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

// ─────────────────────────────────────────────
// @desc    Get all Tridin Live Sessions / Meetings
// @route   GET /api/tridin/live-sessions
// @access  Private (TRIDIN_CANDIDATE only)
// ─────────────────────────────────────────────
const getTridinLiveSessions = async (req, res) => {
  try {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const sessions = await prisma.liveSession.findMany({
      where: {
        status: { not: "deleted" },
        deleteRequested: false,
        OR: [
          { isTridinOnly: true },
          { targetAudience: "TRIDIN" },
          { targetAudience: "BOTH" },
        ],
      },
      include: {
        trainer: {
          select: {
            id: true,
            fullName: true,
            profilePhotoUrl: true,
            email: true,
          },
        },
        occurrences: {
          where: {
            occurrenceDate: {
              gte: yesterday,
            },
          },
          orderBy: {
            startsAt: "asc",
          },
          take: 10,
        },
        _count: {
          select: { tridinVideos: true },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const formattedSessions = sessions.map((s) => {
      let thumbnail = s.thumbnail || null;
      if (thumbnail && !thumbnail.startsWith("http://") && !thumbnail.startsWith("https://") && !thumbnail.startsWith("data:")) {
        const relative = getRelativeUploadPath(thumbnail);
        thumbnail = `${req.protocol}://${req.get("host")}/${relative}`;
      }

      // Parse recurring days
      let recurringDayNums = [];
      if (s.recurringDays) {
        try {
          if (Array.isArray(s.recurringDays)) {
            recurringDayNums = s.recurringDays.map(Number);
          } else if (typeof s.recurringDays === "string") {
            const parsed = JSON.parse(s.recurringDays);
            if (Array.isArray(parsed)) recurringDayNums = parsed.map(Number);
          }
        } catch (e) {
          recurringDayNums = [];
        }
      }

      const recurringDayNames = recurringDayNums
        .filter((n) => n >= 0 && n <= 6)
        .map((n) => SHORT_WEEKDAYS[n]);

      // Check occurrences
      const occurrences = s.occurrences || [];
      const nowMs = now.getTime();

      // Find if any occurrence is currently live (startsAt - 15m <= now <= endsAt + 15m)
      const currentOccurrence = occurrences.find((occ) => {
        const start = new Date(occ.startsAt).getTime() - 15 * 60 * 1000;
        const end = new Date(occ.endsAt).getTime() + 15 * 60 * 1000;
        return nowMs >= start && nowMs <= end && occ.status !== "cancelled";
      });

      // Find next occurrence (startsAt > now)
      const nextOccurrence = occurrences.find((occ) => {
        return new Date(occ.startsAt).getTime() > nowMs && occ.status !== "cancelled";
      });

      // Fallback live check based on day and time in Asia/Kolkata
      const todayKolkataWeekdayStr = now.toLocaleDateString("en-US", { timeZone: "Asia/Kolkata", weekday: "long" });
      const todayWeekdayNum = WEEKDAYS.indexOf(todayKolkataWeekdayStr);
      const isTodayRecurringDay = recurringDayNums.length === 0 || recurringDayNums.includes(todayWeekdayNum);

      let isLiveNow = Boolean(currentOccurrence);

      if (!isLiveNow && isTodayRecurringDay && s.startTime && s.endTime && s.status === "active") {
        try {
          const kolkataTimeStr = now.toLocaleTimeString("en-US", { timeZone: "Asia/Kolkata", hour12: false });
          const [curH, curM] = kolkataTimeStr.split(":").map(Number);
          const curMinutes = curH * 60 + curM;

          const parseTimeToMinutes = (t) => {
            if (!t) return null;
            const match = t.match(/(\d+):(\d+)\s*(AM|PM)?/i);
            if (!match) return null;
            let h = parseInt(match[1], 10);
            const m = parseInt(match[2], 10);
            const meridiem = match[3] ? match[3].toUpperCase() : null;
            if (meridiem === "PM" && h < 12) h += 12;
            if (meridiem === "AM" && h === 12) h = 0;
            return h * 60 + m;
          };

          const startMin = parseTimeToMinutes(s.startTime);
          const endMin = parseTimeToMinutes(s.endTime);
          if (startMin !== null && endMin !== null) {
            if (curMinutes >= startMin - 15 && curMinutes <= endMin + 15) {
              isLiveNow = true;
            }
          }
        } catch (e) {}
      }

      return {
        id: s.id,
        title: s.title || "Live Session",
        courseTitle: s.courseTitle || s.title || "Course",
        category: s.category || "General",
        subtitle: s.subtitle || null,
        description: s.description || null,
        thumbnail,
        startTime: s.startTime || null,
        endTime: s.endTime || null,
        timezone: s.timezone || "Asia/Kolkata",
        meetingLink: s.meetingLink || "",
        meetUrl: s.meetingLink || "",
        isRecurring: s.isRecurring,
        recurrenceType: s.recurrenceType || "daily",
        recurringDays: recurringDayNums,
        recurringDayNames,
        recurrenceEndDate: s.recurrenceEndDate || null,
        totalHours: s.totalHours || null,
        totalDays: s.totalDays || null,
        status: s.status,
        publishState: s.publishState,
        isTridinOnly: Boolean(s.isTridinOnly),
        targetAudience: s.targetAudience || (s.isTridinOnly ? "TRIDIN" : "LURNSTACK"),
        isShared: s.targetAudience === "BOTH",
        trainer: {
          id: s.trainer?.id,
          fullName: s.trainer?.fullName || "LurnStack Trainer",
          profilePhotoUrl: s.trainer?.profilePhotoUrl || null,
          email: s.trainer?.email || null,
        },
        instructorName: s.trainer?.fullName || "LurnStack Trainer",
        isLiveNow,
        todayHasClass: isTodayRecurringDay,
        nextOccurrence: nextOccurrence
          ? {
              id: nextOccurrence.id,
              date: nextOccurrence.occurrenceDate,
              startsAt: nextOccurrence.startsAt,
              endsAt: nextOccurrence.endsAt,
              status: nextOccurrence.status,
            }
          : null,
        videoCount: s._count?.tridinVideos || 0,
        createdAt: s.createdAt,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Tridin live sessions fetched successfully",
      sessions: formattedSessions,
      data: formattedSessions,
      count: formattedSessions.length,
    });
  } catch (error) {
    console.error("getTridinLiveSessions error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch Tridin live sessions",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Candidate joins a Tridin live session (records attendance)
// @route   POST /api/tridin/sessions/:sessionId/join
// @access  Private (TRIDIN_CANDIDATE only)
// ─────────────────────────────────────────────
const joinTridinLiveSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const studentId = req.user.id;

    const session = await prisma.liveSession.findFirst({
      where: {
        id: sessionId,
        status: { not: "deleted" },
        OR: [
          { isTridinOnly: true },
          { targetAudience: "TRIDIN" },
          { targetAudience: "BOTH" },
        ],
      },
      select: {
        id: true,
        title: true,
        meetingLink: true,
        courseId: true,
        trainerId: true,
      },
    });

    if (!session || !session.meetingLink) {
      return res.status(404).json({
        success: false,
        message: "Live session or meeting link not found.",
      });
    }

    // Try to record attendance if today's occurrence exists
    try {
      const now = new Date();
      const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
      const todayEnd = new Date(new Date().setHours(23, 59, 59, 999));

      const todayOccurrence = await prisma.sessionOccurrence.findFirst({
        where: {
          sessionId: session.id,
          occurrenceDate: {
            gte: todayStart,
            lte: todayEnd,
          },
        },
      });

      if (todayOccurrence) {
        await prisma.studentAttendance.upsert({
          where: {
            occurrenceId_studentId: {
              occurrenceId: todayOccurrence.id,
              studentId,
            },
          },
          update: {
            lastJoinedAt: new Date(),
            joinCount: { increment: 1 },
          },
          create: {
            courseId: session.courseId || session.id,
            sessionId: session.id,
            occurrenceId: todayOccurrence.id,
            occurrenceDate: todayOccurrence.occurrenceDate,
            studentId,
            trainerId: session.trainerId,
            status: "present",
            source: "join_button",
          },
        }).catch(() => {});
      }
    } catch (attendanceErr) {
      console.warn("Auto-attendance warning:", attendanceErr.message);
    }

    return res.status(200).json({
      success: true,
      message: "Joining live session",
      meetingLink: session.meetingLink,
    });
  } catch (error) {
    console.error("joinTridinLiveSession error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to join live session",
      error: error.message,
    });
  }
};

module.exports = {
  getTridinCourses,
  getTridinLiveSessions,
  joinTridinLiveSession,
  getTridinProfile,
  createTridinCandidate,
  listTridinCandidates,
  deleteTridinCandidate,
  toggleTridinSession,
};
