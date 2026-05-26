const prisma = require("../config/db");

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

const getKolkataDateTime = (dateStr, timeStr) => {
  return new Date(`${dateStr}T${timeStr}:00+05:30`);
};

const getSessionOccurrences = (session, now = new Date()) => {
  const todayStr = getKolkataDateString(now);
  const createdDateStr = getKolkataDateString(new Date(session.createdAt));

  const dateStr = session.isRecurring ? todayStr : createdDateStr;

  const scheduledAt = session.startTime ? getKolkataDateTime(dateStr, session.startTime) : null;
  const endsAt = session.endTime ? getKolkataDateTime(dateStr, session.endTime) : null;

  return { scheduledAt, endsAt };
};

const formatPublicSession = (session, categoryMap = new Map(), req = null) => {
  const now = new Date();
  const { scheduledAt, endsAt } = getSessionOccurrences(session, now);

  const categoryRecord = session.courseId ? categoryMap.get(session.courseId) : null;
  let courseTitle = null;
  let categoryName = null;
  if (categoryRecord) {
    if (typeof categoryRecord === "object") {
      courseTitle = categoryRecord.name;
      categoryName = categoryRecord.description || "Frontend Development";
    } else {
      courseTitle = categoryRecord;
    }
  }
  courseTitle = courseTitle || session.courseTitle || null;
  categoryName = categoryName || session.category || null;

  let thumbnail = session.thumbnail || null;
  if (thumbnail && req && !thumbnail.startsWith("http://") && !thumbnail.startsWith("https://")) {
    thumbnail = `${req.protocol}://${req.get("host")}/${thumbnail.replace(/\\/g, "/")}`;
  }

  // Pricing calculations
  const pricing = session.pricing || null;
  const priceInPaise = session.priceInPaise !== undefined ? session.priceInPaise : null;
  const amountPaise = priceInPaise !== null ? priceInPaise : (pricing ? pricing.amountPaise : 0);
  const currency = pricing ? pricing.currency : "INR";
  const paymentRequired = priceInPaise !== null || (pricing ? pricing.isActive : false);

  let durationMinutes = session.durationMinutes || 60;
  if (session.startTime && session.endTime) {
    const [sh, sm] = session.startTime.split(":").map(Number);
    const [eh, em] = session.endTime.split(":").map(Number);
    durationMinutes = (eh * 60 + em) - (sh * 60 + sm);
    if (durationMinutes < 0) durationMinutes += 1440;
  }

  return {
    id: session.id,
    courseTitle: courseTitle,
    classTitle: session.title,
    category: categoryName,
    trainerName: session.trainer?.fullName ?? null,
    thumbnail,
    description: session.description || "",
    scheduledDate: session.scheduledDate || (scheduledAt ? getKolkataDateString(scheduledAt) : null),
    startTime: session.startTime,
    endTime: session.endTime,
    scheduledAt,
    endsAt,
    durationMinutes,
    amountPaise,
    currency,
    paymentRequired,
    status: session.status === "active" ? "published" : session.status,
  };
};

// @desc    Get all active public sessions
// @route   GET /api/sessions
// @access  Public
const getPublicSessions = async (req, res) => {
  try {
    const sessions = await prisma.liveSession.findMany({
      where: {
        status: "active",
      },
      include: {
        trainer: true,
        pricing: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const categories = await prisma.category.findMany();
    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    const formatted = sessions.map((session) =>
      formatPublicSession(session, categoryMap, req)
    );

    return res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    console.error("getPublicSessions Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to fetch public sessions.",
    });
  }
};

// @desc    Get a single active public session by ID
// @route   GET /api/sessions/:sessionId
// @access  Public
const getPublicSessionById = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: {
        trainer: true,
        pricing: true,
      },
    });

    // Make sure session exists and status is active (published)
    if (!session || session.status !== "active") {
      return res.status(404).json({
        success: false,
        message: "Session not found.",
      });
    }

    const categories = await prisma.category.findMany();
    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    const formatted = formatPublicSession(session, categoryMap, req);

    return res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    console.error("getPublicSessionById Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to fetch public session details.",
    });
  }
};

module.exports = {
  getPublicSessions,
  getPublicSessionById,
};
