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

const matchesRecurringDays = (session, date) => {
  if (session.isRecurring && session.recurrenceEndDate) {
    const dateStr = getKolkataDateString(date);
    if (dateStr > session.recurrenceEndDate) {
      return false;
    }
  }

  if (!session.isRecurring) return true;
  
  let daysArray = [];
  if (session.recurringDays) {
    if (Array.isArray(session.recurringDays)) {
      daysArray = session.recurringDays;
    } else {
      try {
        daysArray = typeof session.recurringDays === "string"
          ? JSON.parse(session.recurringDays)
          : session.recurringDays;
      } catch (e) {}
    }
  }

  const weekdayStr = date.toLocaleDateString("en-US", { timeZone: "Asia/Kolkata", weekday: "long" });
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const weekday = weekdays.indexOf(weekdayStr);

  if (Array.isArray(daysArray) && daysArray.length > 0) {
    return daysArray.includes(weekday);
  } else if (session.recurrenceType === "weekly") {
    const createDayStr = new Date(session.createdAt).toLocaleDateString("en-US", { timeZone: "Asia/Kolkata", weekday: "long" });
    const createDayOfWeekKolkata = weekdays.indexOf(createDayStr);
    return weekday === createDayOfWeekKolkata;
  }
  return true;
};

const getSessionOccurrences = (session, now = new Date()) => {
  if (!matchesRecurringDays(session, now)) {
    return { scheduledAt: null, endsAt: null };
  }

  const todayStr = getKolkataDateString(now);
  const createdDateStr = getKolkataDateString(new Date(session.createdAt));

  const dateStr = session.isRecurring ? todayStr : createdDateStr;

  const scheduledAt = session.startTime ? getKolkataDateTime(dateStr, session.startTime) : null;
  const endsAt = session.endTime ? getKolkataDateTime(dateStr, session.endTime) : null;

  return { scheduledAt, endsAt };
};

// Helper: serialize recurringDays to an array of integers between 0 and 6
const serializeRecurringDays = (recurringDays) => {
  if (recurringDays === undefined || recurringDays === null) return [];
  let arr = [];
  if (Array.isArray(recurringDays)) {
    arr = recurringDays;
  } else if (typeof recurringDays === "string") {
    try {
      arr = JSON.parse(recurringDays);
    } catch (e) {
      arr = recurringDays.split(",").map(x => x.trim());
    }
  }
  if (Array.isArray(arr)) {
    return arr.map(Number).filter(n => !Number.isNaN(n) && Number.isInteger(n) && n >= 0 && n <= 6);
  }
  return [];
};

// Helper: query completed occurrences and compute duration & count in memory
const populateSessionProgress = async (sessions) => {
  if (!sessions) return sessions;
  const isArray = Array.isArray(sessions);
  const sessionList = isArray ? sessions : [sessions];
  if (sessionList.length === 0) return sessions;

  const sessionIds = sessionList.map(s => s.id);

  const completedOccurrences = await prisma.sessionOccurrence.findMany({
    where: {
      sessionId: { in: sessionIds },
      status: "completed"
    },
    select: {
      sessionId: true,
      startsAt: true,
      endsAt: true
    }
  });

  const progressMap = {};
  for (const occ of completedOccurrences) {
    const sId = occ.sessionId;
    if (!progressMap[sId]) {
      progressMap[sId] = { completedHours: 0, completedDays: 0 };
    }
    const durationMs = occ.endsAt.getTime() - occ.startsAt.getTime();
    const durationHours = Math.max(0, durationMs / (1000 * 60 * 60));
    progressMap[sId].completedHours += durationHours;
    progressMap[sId].completedDays += 1;
  }

  for (const s of sessionList) {
    const progress = progressMap[s.id] || { completedHours: 0, completedDays: 0 };
    s.completedHours = Math.round(progress.completedHours * 100) / 100;
    s.completedDays = progress.completedDays;
  }

  return sessions;
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
    courseId: session.courseId,
    trainerCourseId: session.courseId,
    courseAccessId: session.courseId,
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
    hasCourseAccess: false,
    isRecurring: session.isRecurring,
    recurrenceType: session.recurrenceType,
    recurringDays: serializeRecurringDays(session.recurringDays),
    recurrenceEndDate: session.recurrenceEndDate || null,
    totalHours: session.totalHours !== undefined && session.totalHours !== null ? session.totalHours : null,
    totalDays: session.totalDays !== undefined && session.totalDays !== null ? session.totalDays : null,
    completedHours: session.completedHours !== undefined && session.completedHours !== null ? session.completedHours : 0,
    completedDays: session.completedDays !== undefined && session.completedDays !== null ? session.completedDays : 0,
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
        deleteRequested: false,
        AND: [
          { OR: [{ sectionType: { not: "TIT" } }, { sectionType: null }] },
          { OR: [{ sessionType: { not: "TIT" } }, { sessionType: null }] },
          { OR: [{ source: { not: "admin_tit_classes" } }, { source: null }] }
        ]
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

    const activeFormatted = formatted.filter(cls => {
      // For recurring sessions, only show them if they scheduled to occur today
      if (cls.scheduledAt === null) {
        return false;
      }
      return true;
    });

    return res.status(200).json({
      success: true,
      data: activeFormatted,
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
