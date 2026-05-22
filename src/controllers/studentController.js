const prisma = require("../config/db");
const razorpay = require("../config/razorpay");
const crypto = require("crypto");

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

// Helper to get today's time string in Asia/Kolkata timezone (format: HH:MM)
const getKolkataTimeString = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(date);
};

const getKolkataDateTime = (dateStr, timeStr) => {
  return new Date(`${dateStr}T${timeStr}:00+05:30`);
};

// Helper to calculate occurrences
const getSessionOccurrences = (session, now = new Date()) => {
  const todayStr = getKolkataDateString(now);
  const createdDateStr = getKolkataDateString(new Date(session.createdAt));

  const dateStr = session.isRecurring ? todayStr : createdDateStr;

  const scheduledAt = session.startTime ? getKolkataDateTime(dateStr, session.startTime) : null;
  const endsAt = session.endTime ? getKolkataDateTime(dateStr, session.endTime) : null;

  return { scheduledAt, endsAt };
};

// Helper to calculate session status dynamically based on current server time
const calculateSessionTodayStatus = (session, now = new Date()) => {
  if (session.status === "paused") {
    return "paused";
  }
  if (session.status === "ended") {
    return "ended";
  }
  if (session.status === "cancelled") {
    return "cancelled";
  }

  const todayStr = getKolkataDateString(now);

  // Check if today is in cancelledDates
  let cancelledArray = [];
  if (session.cancelledDates) {
    if (Array.isArray(session.cancelledDates)) {
      cancelledArray = session.cancelledDates;
    } else {
      try {
        cancelledArray = typeof session.cancelledDates === 'string'
          ? JSON.parse(session.cancelledDates)
          : session.cancelledDates;
      } catch (e) {
        cancelledArray = [];
      }
    }
  }
  if (Array.isArray(cancelledArray) && cancelledArray.includes(todayStr)) {
    return "cancelled_today";
  }

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

  if (!session.startTime || !session.endTime) {
    return "upcoming";
  }

  // Get current minutes since midnight in Asia/Kolkata
  const timeStr = getKolkataTimeString(now);
  const [currentHours, currentMinutes] = timeStr.split(":").map(Number);
  const currentTotalMinutes = currentHours * 60 + currentMinutes;

  // Parse session start and end times (HH:MM)
  const [startHours, startMinutes] = session.startTime.split(":").map(Number);
  const [endHours, endMinutes] = session.endTime.split(":").map(Number);
  const startTotalMinutes = startHours * 60 + startMinutes;
  const endTotalMinutes = endHours * 60 + endMinutes;

  const joinOpenMinutes = startTotalMinutes - 5;

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

// Helper: build response shape for student session
const formatSession = (session, categoryMap = new Map(), studentId = null, req = null) => {
  const now = new Date();
  const todayStatus = calculateSessionTodayStatus(session, now);
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

  const isAddedToCard = session.cards ? session.cards.length > 0 : false;
  
  const todayStr = getKolkataDateString(now);
  const isJoined = session.attendances ? session.attendances.some(att => att.joinDate === todayStr) : false;

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

  // Booking calculations
  const latestBooking = session.billingBookings && session.billingBookings.length > 0 ? session.billingBookings[0] : null;
  const bookingStatus = latestBooking ? latestBooking.status : null;
  const isPaid = latestBooking ? latestBooking.status === "paid" : false;

  // Join logic rules
  const isSessionActive = session.status === "active";
  const isNotCancelled = todayStatus !== "cancelled" && todayStatus !== "cancelled_today";
  const isInsideWindow = todayStatus === "join_open" || todayStatus === "live";
  
  let hasPaidBookingForToday = false;
  if (paymentRequired) {
    hasPaidBookingForToday = session.billingBookings ? session.billingBookings.some(b => {
      return b.status === "paid" && getKolkataDateString(new Date(b.sessionDate)) === todayStr;
    }) : false;
  } else {
    hasPaidBookingForToday = true;
  }

  const canJoin = isSessionActive && isNotCancelled && isInsideWindow && hasPaidBookingForToday;

  return {
    id: session.id,
    courseId: session.courseId,
    trainerId: `trainer_${session.trainerId}`,
    trainerName: session.trainer?.fullName ?? null,
    trainerEmail: session.trainer?.email ?? null,
    courseTitle: courseTitle,
    category: categoryName,
    classTitle: session.title,
    title: session.title,
    subtitle: session.subtitle,
    description: session.description,
    thumbnail,
    scheduledAt,
    endsAt,
    startTime: session.startTime,
    endTime: session.endTime,
    timezone: session.timezone,
    meetingLink: session.meetingLink,
    isRecurring: session.isRecurring,
    recurrenceType: session.recurrenceType,
    status: session.status,
    todayStatus,
    cancellationReason: null,
    isAddedToCard,
    isJoined,
    cancelledDates: session.cancelledDates,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    endedAt: session.endedAt,
    priceInPaise,
    amountPaise,
    currency,
    paymentRequired,
    isPaid,
    canJoin,
    bookingStatus
  };
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
        thumbnail: cls.thumbnail ? (cls.thumbnail.startsWith("http://") || cls.thumbnail.startsWith("https://") ? cls.thumbnail : `${req.protocol}://${req.get("host")}/${cls.thumbnail.replace(/\\/g, "/")}`) : null,
        status,
        isRecurring: cls.isRecurring,
        recurrenceType: cls.recurrenceType
      };
    });

    // Merge sessions into live-classes query for backwards compatibility
    const studentId = parseInt(req.user.id);
    const sessions = await prisma.liveSession.findMany({
      include: {
        trainer: true,
        cards: { where: { studentId } },
        attendances: { where: { studentId } },
        pricing: true,
        billingBookings: {
          where: { studentId },
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const categories = await prisma.category.findMany();
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    const todayStr = getKolkataDateString(now);

    const sessionMappedClasses = sessions.map(session => {
      const todayStatus = calculateSessionTodayStatus(session, now);
      const { scheduledAt, endsAt } = getSessionOccurrences(session, now);
      const isJoinedToday = session.attendances.some(att => att.joinDate === todayStr);

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

      let durationMinutes = 60;
      if (session.startTime && session.endTime) {
        const [sh, sm] = session.startTime.split(":").map(Number);
        const [eh, em] = session.endTime.split(":").map(Number);
        durationMinutes = (eh * 60 + em) - (sh * 60 + sm);
        if (durationMinutes < 0) durationMinutes += 1440;
      }

      let legacyStatus = "upcoming";
      if (todayStatus === "live" || todayStatus === "join_open") {
        legacyStatus = "live";
      } else if (todayStatus === "completed_today" || todayStatus === "ended") {
        legacyStatus = "completed";
      } else if (todayStatus === "paused") {
        legacyStatus = "paused";
      } else if (todayStatus === "cancelled" || todayStatus === "cancelled_today") {
        legacyStatus = "cancelled";
      }

      return {
        id: session.id,
        courseName: courseTitle || "Live Session",
        category: categoryName,
        classTitle: session.title,
        instructor: session.trainer?.fullName || "Trainer",
        description: session.description || "",
        scheduledAt: scheduledAt,
        endsAt: endsAt,
        durationMinutes: durationMinutes,
        date: scheduledAt ? getKolkataDateString(scheduledAt) : "",
        time: session.startTime || "",
        duration: `${durationMinutes} mins`,
        meetLink: session.meetingLink || "",
        meetingLink: session.meetingLink || "",
        thumbnail: session.thumbnail ? (session.thumbnail.startsWith("http://") || session.thumbnail.startsWith("https://") ? session.thumbnail : `${req.protocol}://${req.get("host")}/${session.thumbnail.replace(/\\/g, "/")}`) : null,
        status: legacyStatus,
        isRecurring: session.isRecurring,
        recurrenceType: session.recurrenceType,
        courseId: session.courseId,
        trainerId: `trainer_${session.trainerId}`,
        title: session.title,
        subtitle: session.subtitle,
        timezone: session.timezone,
        todayStatus: todayStatus,
        cancellationReason: null,
        isAddedToCard: session.cards.length > 0,
        isJoined: isJoinedToday
      };
    });

    res.status(200).json({
      success: true,
      data: [...enrichedClasses, ...sessionMappedClasses],
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

    let liveClass = null;
    const classIdInt = parseInt(classId, 10);
    if (!isNaN(classIdInt)) {
      liveClass = await prisma.liveClass.findUnique({
        where: { id: classIdInt },
      });
    }

    if (liveClass) {
      if (liveClass.thumbnail) {
        liveClass.thumbnail = liveClass.thumbnail.startsWith("http://") || liveClass.thumbnail.startsWith("https://") ? liveClass.thumbnail : `${req.protocol}://${req.get("host")}/${liveClass.thumbnail.replace(/\\/g, "/")}`;
      }
      return res.status(200).json({
        success: true,
        data: {
          ...liveClass,
          isRecurring: liveClass.isRecurring,
          recurrenceType: liveClass.recurrenceType
        },
      });
    }

    // Try finding in LiveSession for backwards compatibility
    const studentId = parseInt(req.user.id);
    const session = await prisma.liveSession.findUnique({
      where: { id: classId },
      include: {
        trainer: true,
        cards: { where: { studentId } },
        attendances: { where: { studentId } }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Live class or session not found.",
      });
    }

    const categories = await prisma.category.findMany();
    const categoryMap = new Map(categories.map(c => [c.id, c]));

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

    const now = new Date();
    const todayStatus = calculateSessionTodayStatus(session, now);
    const { scheduledAt, endsAt } = getSessionOccurrences(session, now);
    const isJoinedToday = session.attendances.some(att => att.joinDate === getKolkataDateString(now));

    let durationMinutes = 60;
    if (session.startTime && session.endTime) {
      const [sh, sm] = session.startTime.split(":").map(Number);
      const [eh, em] = session.endTime.split(":").map(Number);
      durationMinutes = (eh * 60 + em) - (sh * 60 + sm);
      if (durationMinutes < 0) durationMinutes += 1440;
    }

    let legacyStatus = "upcoming";
    if (todayStatus === "live" || todayStatus === "join_open") {
      legacyStatus = "live";
    } else if (todayStatus === "completed_today" || todayStatus === "ended") {
      legacyStatus = "completed";
    } else if (todayStatus === "paused") {
      legacyStatus = "paused";
    } else if (todayStatus === "cancelled" || todayStatus === "cancelled_today") {
      legacyStatus = "cancelled";
    }

    return res.status(200).json({
      success: true,
      data: {
        id: session.id,
        courseName: courseTitle || "Live Session",
        category: categoryName,
        classTitle: session.title,
        instructor: session.trainer?.fullName || "Trainer",
        description: session.description || "",
        scheduledAt: scheduledAt,
        endsAt: endsAt,
        durationMinutes: durationMinutes,
        date: scheduledAt ? getKolkataDateString(scheduledAt) : "",
        time: session.startTime || "",
        duration: `${durationMinutes} mins`,
        meetLink: session.meetingLink || "",
        meetingLink: session.meetingLink || "",
        thumbnail: session.thumbnail ? (session.thumbnail.startsWith("http://") || session.thumbnail.startsWith("https://") ? session.thumbnail : `${req.protocol}://${req.get("host")}/${session.thumbnail.replace(/\\/g, "/")}`) : null,
        status: legacyStatus,
        isRecurring: session.isRecurring,
        recurrenceType: session.recurrenceType,
        courseId: session.courseId,
        trainerId: `trainer_${session.trainerId}`,
        title: session.title,
        subtitle: session.subtitle,
        timezone: session.timezone,
        todayStatus: todayStatus,
        cancellationReason: null,
        isAddedToCard: session.cards.length > 0,
        isJoined: isJoinedToday
      }
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

    let liveClass = null;
    const classIdInt = parseInt(classId, 10);
    if (!isNaN(classIdInt)) {
      liveClass = await prisma.liveClass.findUnique({
        where: { id: classIdInt },
        select: { meetLink: true },
      });
    }

    if (liveClass) {
      return res.status(200).json({
        success: true,
        message: "Successfully joined the class!",
        meetLink: liveClass.meetLink,
      });
    }

    // Try joining via the new join session logic
    req.params.sessionId = classId;
    return joinSession(req, res);

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
        attendances: { where: { studentId } },
        pricing: true,
        billingBookings: {
          where: { studentId },
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const categories = await prisma.category.findMany();
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    let formattedSessions = sessions.map(session => formatSession(session, categoryMap, studentId, req));

    if (filter) {
      formattedSessions = formattedSessions.filter(s => s.todayStatus === filter || s.status === filter);
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
        attendances: { where: { studentId } },
        pricing: true,
        billingBookings: {
          where: { studentId },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found." });
    }

    const categories = await prisma.category.findMany();
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    res.status(200).json({
      success: true,
      message: "Session details fetched successfully",
      data: formatSession(session, categoryMap, studentId, req)
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

    const categories = await prisma.category.findMany();
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    const formattedCards = cards.map(card => {
      const session = card.session;
      const sessionEnriched = {
        ...session,
        cards: [card]
      };
      const formatted = formatSession(sessionEnriched, categoryMap, studentId, req);
      return {
        cardId: card.id,
        ...formatted
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
    const { occurrenceDate, sessionDate } = req.body || {};
    const studentId = parseInt(req.user.id);

    // 1. Load session by sessionId
    const session = await prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: {
        pricing: true,
        billingBookings: {
          where: { studentId },
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found." });
    }

    // 2. Validate session status is published/active
    if (session.status !== "active") {
      return res.status(400).json({ success: false, message: `Cannot join. Session is ${session.status}.` });
    }

    const pricing = session.pricing || null;
    const paymentRequired = pricing ? pricing.isActive : false;

    // Check paid booking
    const now = new Date();
    const todayStrKolkata = getKolkataDateString(now);
    
    if (paymentRequired) {
      const hasPaidBooking = session.billingBookings.some(b => {
        return b.status === "paid" && getKolkataDateString(new Date(b.sessionDate)) === todayStrKolkata;
      });
      if (!hasPaidBooking) {
        return res.status(400).json({
          success: false,
          message: "Please complete payment before joining."
        });
      }
    }

    // 3. Determine occurrence date
    const targetDateStr = occurrenceDate || sessionDate || todayStrKolkata;
    const targetDate = new Date(targetDateStr);

    // 4. Find occurrence by sessionId and occurrenceDate
    let occurrence = await prisma.sessionOccurrence.findFirst({
      where: {
        sessionId: sessionId,
        occurrenceDate: targetDate
      }
    });

    // 5. If occurrence does not exist but session is valid for that date, create it
    if (!occurrence) {
      const startsAt = session.startTime ? getKolkataDateTime(targetDateStr, session.startTime) : null;
      const endsAt = session.endTime ? getKolkataDateTime(targetDateStr, session.endTime) : null;
      
      if (!startsAt || !endsAt) {
        return res.status(400).json({ success: false, message: "Session schedule is invalid." });
      }

      occurrence = await prisma.sessionOccurrence.upsert({
        where: {
          sessionId_occurrenceDate: {
            sessionId: sessionId,
            occurrenceDate: targetDate
          }
        },
        update: {},
        create: {
          sessionId: session.id,
          trainerId: session.trainerId,
          courseId: session.courseId || "",
          occurrenceDate: targetDate,
          startsAt: startsAt,
          endsAt: endsAt,
          status: "scheduled"
        }
      });
    }

    // 6. Use server time in Asia/Kolkata to check window
    const bufferStartsAt = new Date(occurrence.startsAt.getTime() - 5 * 60 * 1000); // 5 mins before
    if (now < bufferStartsAt || now > occurrence.endsAt) {
      return res.status(400).json({ 
        success: false, 
        message: `Session is not active now. Class starts at ${session.startTime} and ends at ${session.endTime}` 
      });
    }

    // 7 & 8 & 9. Create/update attendance using unique key
    const graceMinutes = 10;
    const graceEndTime = new Date(occurrence.startsAt.getTime() + graceMinutes * 60 * 1000);

    const existingAttendance = await prisma.studentAttendance.findUnique({
      where: {
        occurrenceId_studentId: {
          occurrenceId: occurrence.id,
          studentId: studentId
        }
      }
    });

    let status = "present";
    let firstJoinedAt = now;
    let joinCount = 1;

    if (existingAttendance) {
      firstJoinedAt = existingAttendance.firstJoinedAt;
      joinCount = existingAttendance.joinCount + 1;
      // CRITICAL REJOIN RULE: do NOT downgrade status if already present
      if (existingAttendance.status === 'present') {
        status = 'present';
      } else if (firstJoinedAt <= graceEndTime) {
        status = "present";
      } else {
        status = "late";
      }
    } else {
      if (now <= graceEndTime) {
        status = "present";
      } else {
        status = "late";
      }
    }

    const studentAttendance = await prisma.studentAttendance.upsert({
      where: {
        occurrenceId_studentId: {
          occurrenceId: occurrence.id,
          studentId: studentId
        }
      },
      update: {
        lastJoinedAt: now,
        joinCount: joinCount,
        status: status
      },
      create: {
        courseId: occurrence.courseId || session.courseId || "",
        sessionId: sessionId,
        occurrenceId: occurrence.id,
        occurrenceDate: occurrence.occurrenceDate,
        studentId: studentId,
        trainerId: occurrence.trainerId,
        firstJoinedAt: firstJoinedAt,
        lastJoinedAt: now,
        joinCount: joinCount,
        status: status,
        source: "join_button"
      }
    });

    // Keep legacy attendance row for backwards compatibility
    await prisma.attendance.upsert({
      where: {
        sessionId_studentId_joinDate: {
          sessionId,
          studentId,
          joinDate: targetDateStr
        }
      },
      update: {
        status: "joined",
        joinedAt: now
      },
      create: {
        sessionId,
        studentId,
        joinDate: targetDateStr,
        status: "joined",
        joinedAt: now
      }
    });

    // 10. Return meeting link and attendance
    res.status(200).json({
      success: true,
      message: "Attendance recorded",
      data: {
        sessionId: session.id,
        occurrenceId: occurrence.id,
        meetingLink: session.meetingLink,
        joinedAt: now.toISOString(),
        attendance: {
          status: studentAttendance.status,
          firstJoinedAt: studentAttendance.firstJoinedAt.toISOString(),
          lastJoinedAt: studentAttendance.lastJoinedAt.toISOString(),
          joinCount: studentAttendance.joinCount
        }
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

    const categories = await prisma.category.findMany();
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    const formattedBookings = attendances.map(att => {
      const session = att.session;
      const formatted = formatSession(session, categoryMap, studentId, req);
      return {
        bookingId: att.id,
        ...formatted,
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

// ─────────────────────────────────────────────
// @desc    Create Session Booking (Razorpay Order creation)
// @route   POST /api/student/sessions/:sessionId/bookings
// ─────────────────────────────────────────────
const createBooking = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { sessionDate } = req.body;
    const studentId = parseInt(req.user.id);

    if (!sessionDate) {
      return res.status(400).json({ success: false, message: "sessionDate is required." });
    }

    // Fetch active session pricing
    const sessionPricing = await prisma.sessionPricing.findUnique({
      where: { sessionId }
    });

    if (!sessionPricing || !sessionPricing.isActive) {
      return res.status(404).json({ success: false, message: "Active session pricing not found for this session." });
    }

    const bookingDate = new Date(sessionDate);

    // Create Booking row (pending_payment)
    const booking = await prisma.booking.create({
      data: {
        studentId,
        sessionId,
        sessionDate: bookingDate,
        amountPaise: sessionPricing.amountPaise,
        currency: sessionPricing.currency,
        status: "pending_payment"
      }
    });

    // Request payment token from Razorpay
    const orderOptions = {
      amount: sessionPricing.amountPaise,
      currency: sessionPricing.currency,
      receipt: `rcpt_${booking.id.substring(0, 20)}`,
      notes: {
        bookingId: booking.id,
        sessionId: sessionId,
        studentId: studentId.toString(),
        sessionDate: sessionDate
      }
    };

    const razorpayOrder = await razorpay.orders.create(orderOptions);

    // Create tracking Payment row
    await prisma.payment.create({
      data: {
        bookingId: booking.id,
        studentId,
        sessionId,
        razorpayOrderId: razorpayOrder.id,
        amountPaise: sessionPricing.amountPaise,
        currency: sessionPricing.currency,
        status: "created"
      }
    });

    // Fetch student details
    const studentUser = await prisma.user.findUnique({
      where: { id: studentId },
      select: { fullName: true, email: true, phoneNumber: true }
    });

    return res.status(201).json({
      success: true,
      data: {
        bookingId: booking.id,
        razorpayOrderId: razorpayOrder.id,
        amountPaise: booking.amountPaise,
        currency: booking.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
        student: {
          name: studentUser?.fullName || "Student",
          email: studentUser?.email || "",
          phone: studentUser?.phoneNumber || ""
        }
      }
    });
  } catch (error) {
    console.error("Create Booking Error:", error);
    return res.status(500).json({ success: false, message: "Failed to create booking.", error: error.message });
  }
};

// ─────────────────────────────────────────────
// @desc    Verify Razorpay payment signature
// @route   POST /api/student/payments/razorpay/verify
// ─────────────────────────────────────────────
const verifyPayment = async (req, res) => {
  try {
    const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!bookingId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ success: false, message: "bookingId, razorpayOrderId, razorpayPaymentId, and razorpaySignature are required." });
    }

    // HMAC verification
    const text = razorpayOrderId + "|" + razorpayPaymentId;
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(text)
      .digest("hex");

    if (generatedSignature !== razorpaySignature) {
      return res.status(400).json({ success: false, message: "Payment verification failed. Invalid signature." });
    }

    // Update state transactionally
    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId }
      });

      if (!booking) {
        throw new Error("Booking not found");
      }

      if (booking.status === "paid") {
        return booking;
      }

      // Update Booking status to paid
      const updatedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: { status: "paid" }
      });

      // Update Payment record
      const payment = await tx.payment.findUnique({
        where: { razorpayOrderId }
      });

      let updatedPayment;
      if (payment) {
        updatedPayment = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: "captured",
            razorpayPaymentId,
            razorpaySignature,
            paidAt: new Date()
          }
        });
      } else {
        updatedPayment = await tx.payment.create({
          data: {
            bookingId,
            studentId: booking.studentId,
            sessionId: booking.sessionId,
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
            amountPaise: booking.amountPaise,
            currency: booking.currency,
            status: "captured",
            paidAt: new Date()
          }
        });
      }

      // Calculate and create TrainerEarning
      const sessionPricing = await tx.sessionPricing.findUnique({
        where: { sessionId: booking.sessionId }
      });

      if (sessionPricing) {
        const session = await tx.liveSession.findUnique({
          where: { id: booking.sessionId }
        });

        if (session) {
          const trainerSharePercent = sessionPricing.trainerSharePercent;
          const grossAmountPaise = booking.amountPaise;
          const trainerAmountPaise = Math.round(grossAmountPaise * (trainerSharePercent / 100));
          const platformFeePaise = grossAmountPaise - trainerAmountPaise;

          const sessionEnd = new Date(booking.sessionDate);
          sessionEnd.setHours(sessionEnd.getHours() + 2); // available after 2 hours

          const existingEarning = await tx.trainerEarning.findFirst({
            where: { bookingId: booking.id }
          });

          if (!existingEarning) {
            await tx.trainerEarning.create({
              data: {
                trainerId: session.trainerId,
                sessionId: booking.sessionId,
                sessionDate: booking.sessionDate,
                bookingId: booking.id,
                paymentId: updatedPayment.id,
                grossAmountPaise,
                platformFeePaise,
                trainerAmountPaise,
                status: "pending_session_completion",
                availableAfter: sessionEnd
              }
            });
          }
        }
      }

      return updatedBooking;
    });

    return res.status(200).json({
      success: true,
      message: "Payment verified.",
      data: {
        bookingId: result.id,
        status: "paid",
        canJoin: true
      }
    });
  } catch (error) {
    console.error("Verify Payment Error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to verify payment." });
  }
};

// ─────────────────────────────────────────────
// @desc    Get Student Payments History
// @route   GET /api/student/payments
// ─────────────────────────────────────────────
const getStudentPayments = async (req, res) => {
  try {
    const studentId = parseInt(req.user.id);
    const bookings = await prisma.booking.findMany({
      where: { studentId },
      include: {
        session: true,
        payments: true
      },
      orderBy: { createdAt: "desc" }
    });

    return res.status(200).json({
      success: true,
      data: bookings
    });
  } catch (error) {
    console.error("Get Student Payments Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch payments." });
  }
};

// ─────────────────────────────────────────────
// @desc    Get Course Attendance for Student
// @route   GET /api/student/courses/:courseId/attendance
// ─────────────────────────────────────────────
const getCourseAttendance = async (req, res) => {
  try {
    const { courseId } = req.params;
    const studentId = parseInt(req.user.id);

    const attendance = await prisma.studentAttendance.findMany({
      where: { courseId, studentId },
      include: {
        occurrence: true
      },
      orderBy: { occurrenceDate: "desc" }
    });

    return res.status(200).json({ success: true, data: attendance });
  } catch (error) {
    console.error("Get Course Attendance Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch attendance." });
  }
};

// ─────────────────────────────────────────────
// @desc    Get Session Attendance for Student
// @route   GET /api/student/sessions/:sessionId/attendance
// ─────────────────────────────────────────────
const getSessionAttendance = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const studentId = parseInt(req.user.id);

    const attendance = await prisma.studentAttendance.findMany({
      where: { sessionId, studentId },
      include: {
        occurrence: true
      },
      orderBy: { occurrenceDate: "desc" }
    });

    return res.status(200).json({ success: true, data: attendance });
  } catch (error) {
    console.error("Get Session Attendance Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch session attendance." });
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
  createBooking,
  verifyPayment,
  getStudentPayments,
  getCourseAttendance,
  getSessionAttendance
};

