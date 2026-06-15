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

// Helper to calculate occurrences
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

  if (!matchesRecurringDays(session, now)) {
    return "not_scheduled";
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

// Helper: build response shape for student session
const formatSession = (session, categoryMap = new Map(), studentId = null, req = null, activeCourseIds = new Set()) => {
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
  
  const attendanceRecord = session.attendances && session.attendances.length > 0 ? session.attendances[0] : null;
  const isJoined = attendanceRecord ? true : false;

  let thumbnail = session.thumbnail || null;
  if (thumbnail && req && !thumbnail.startsWith("http://") && !thumbnail.startsWith("https://")) {
    thumbnail = `${req.protocol}://${req.get("host")}/${thumbnail.replace(/\\/g, "/")}`;
  }

  // Pricing calculations
  const pricing = session.pricing || null;
  const priceInPaise = session.priceInPaise !== undefined ? session.priceInPaise : null;
  const amountPaise = priceInPaise !== null ? priceInPaise : (pricing ? pricing.amountPaise : 0);
  const currency = pricing ? pricing.currency : "INR";

  // Course access check
  const hasCourseAccess = activeCourseIds && session.courseId ? activeCourseIds.has(session.courseId) : false;

  let paymentRequired = hasCourseAccess ? false : (priceInPaise !== null || (pricing ? pricing.isActive : false));

  // Course status override checks
  let sessionStatus = session.status;
  if (categoryRecord && categoryRecord.status && categoryRecord.status !== "active") {
    sessionStatus = categoryRecord.status;
  }
  
  // If the course or session is ended/completed/cancelled, do not require payment
  if (sessionStatus === "ended" || sessionStatus === "completed" || sessionStatus === "cancelled") {
    paymentRequired = false;
  }

  // Booking calculations
  const hasPaidBooking = (session.billingBookings ? session.billingBookings.some(b => b.status === "paid") : false) || hasCourseAccess;
  const latestBooking = session.billingBookings && session.billingBookings.length > 0 ? session.billingBookings[0] : null;
  let bookingStatus = hasPaidBooking ? "paid" : (latestBooking ? latestBooking.status : null);
  if (hasCourseAccess) {
    bookingStatus = "paid";
  }
  const isPaid = hasPaidBooking;

  // Join logic rules
  const isSessionActive = session.status === "active";
  const isNotCancelled = todayStatus !== "cancelled" && todayStatus !== "cancelled_today";
  const isInsideWindow = todayStatus === "join_open" || todayStatus === "live";
  
  let hasPaidBookingForToday = false;
  if (paymentRequired) {
    hasPaidBookingForToday = hasPaidBooking;
  } else {
    hasPaidBookingForToday = true;
  }

  const canJoin = isSessionActive && isNotCancelled && isInsideWindow && (hasPaidBookingForToday || hasCourseAccess);

  // Duration
  let durationMinutes = session.durationMinutes || 60;
  if (session.startTime && session.endTime) {
    const [sh, sm] = session.startTime.split(":").map(Number);
    const [eh, em] = session.endTime.split(":").map(Number);
    durationMinutes = (eh * 60 + em) - (sh * 60 + sm);
    if (durationMinutes < 0) durationMinutes += 1440;
  }

  // Attendance details
  const attendance = attendanceRecord ? {
    id: attendanceRecord.id,
    status: attendanceRecord.status,
    firstJoinedAt: attendanceRecord.firstJoinedAt,
    lastJoinedAt: attendanceRecord.lastJoinedAt,
    joinCount: attendanceRecord.joinCount,
    totalDurationSeconds: attendanceRecord.totalDurationSeconds,
    attendanceStatus: attendanceRecord.status
  } : null;
  const attendanceStatus = attendanceRecord ? attendanceRecord.status : null;
  const joinedAt = attendanceRecord ? (attendanceRecord.joinedAt || attendanceRecord.firstJoinedAt) : null;
  const lastJoinedAt = attendanceRecord ? attendanceRecord.lastJoinedAt : null;

  const isFree = !paymentRequired;

  const liveClass = {
    id: session.id,
    courseId: session.courseId,
    courseAccessId: session.courseId,
    title: session.title,
    scheduledAt,
    endsAt,
    durationMinutes,
    meetUrl: session.meetingLink || "",
    status: sessionStatus,
    isPaid,
    paymentRequired
  };

  return {
    id: session.id,
    title: session.title,
    courseId: session.courseId,
    trainerCourseId: session.courseId,
    courseAccessId: session.courseId,
    trainerId: `trainer_${session.trainerId}`,
    trainerName: session.trainer?.fullName ?? null,
    trainerEmail: session.trainer?.email ?? null,
    courseTitle: courseTitle,
    category: categoryName,
    classTitle: session.title,
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
    recurringDays: serializeRecurringDays(session.recurringDays),
    recurrenceEndDate: session.recurrenceEndDate || null,
    status: sessionStatus,
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
    isFree,
    isPaid,
    hasCourseAccess,
    canJoin,
    bookingStatus,
    durationMinutes,
    attendance,
    attendanceStatus,
    joinedAt,
    lastJoinedAt,
    recordingUrl: session.recordingUrl || null,
    materials: session.materials || null,
    liveClass
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
      where: {
        OR: [
          { sectionType: { not: "TIT" } },
          { sectionType: null },
        ],
      },
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
    const activeCourseBookings = await prisma.booking.findMany({
      where: { studentId, accessScope: "course", status: "paid" },
      select: { courseId: true }
    });
    const activeCourseIds = new Set(activeCourseBookings.map(b => b.courseId).filter(Boolean));

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
      const attendanceRecord = session.attendances && session.attendances.length > 0 ? session.attendances[0] : null;
      const isJoined = attendanceRecord ? true : false;

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

      const hasCourseAccess = activeCourseIds.has(session.courseId);
      const hasPaidBooking = session.billingBookings.some(b => b.status === "paid") || hasCourseAccess;
      const latestBooking = session.billingBookings.length > 0 ? session.billingBookings[0] : null;
      let bookingStatus = hasPaidBooking ? "paid" : (latestBooking ? latestBooking.status : null);
      if (hasCourseAccess) {
        bookingStatus = "paid";
      }
      const isPaid = hasPaidBooking;
      const priceInPaise = session.priceInPaise !== undefined ? session.priceInPaise : null;
      const pricing = session.pricing || null;
      let paymentRequired = hasCourseAccess ? false : (priceInPaise !== null || (pricing ? pricing.isActive : false));

      let sessionStatus = session.status;
      if (categoryRecord && categoryRecord.status && categoryRecord.status !== "active") {
        sessionStatus = categoryRecord.status;
      }
      if (sessionStatus === "ended" || sessionStatus === "completed" || sessionStatus === "cancelled") {
        paymentRequired = false;
      }

      legacyStatus = "upcoming";
      if (todayStatus === "live" || todayStatus === "join_open") {
        legacyStatus = "live";
      } else if (todayStatus === "completed_today" || todayStatus === "ended" || sessionStatus === "ended" || sessionStatus === "completed") {
        legacyStatus = "completed";
      } else if (todayStatus === "paused") {
        legacyStatus = "paused";
      } else if (todayStatus === "cancelled" || todayStatus === "cancelled_today" || sessionStatus === "cancelled") {
        legacyStatus = "cancelled";
      }

      const isFree = !paymentRequired;

      const attendance = attendanceRecord ? {
        id: attendanceRecord.id,
        status: attendanceRecord.status,
        firstJoinedAt: attendanceRecord.firstJoinedAt,
        lastJoinedAt: attendanceRecord.lastJoinedAt,
        joinCount: attendanceRecord.joinCount,
        totalDurationSeconds: attendanceRecord.totalDurationSeconds,
        attendanceStatus: attendanceRecord.status
      } : null;
      const attendanceStatus = attendanceRecord ? attendanceRecord.status : null;
      const joinedAt = attendanceRecord ? (attendanceRecord.joinedAt || attendanceRecord.firstJoinedAt) : null;
      const lastJoinedAt = attendanceRecord ? attendanceRecord.lastJoinedAt : null;

      const liveClass = {
        id: session.id,
        courseId: session.courseId,
        courseAccessId: session.courseId,
        title: session.title,
        scheduledAt,
        endsAt,
        durationMinutes,
        meetUrl: session.meetingLink || "",
        status: sessionStatus,
        isPaid,
        paymentRequired
      };

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
        trainerCourseId: session.courseId,
        courseAccessId: session.courseId,
        trainerId: `trainer_${session.trainerId}`,
        title: session.title,
        subtitle: session.subtitle,
        timezone: session.timezone,
        todayStatus: todayStatus,
        cancellationReason: null,
        isAddedToCard: session.cards.length > 0,
        isJoined: isJoined,
        isPaid,
        hasCourseAccess,
        paymentRequired,
        bookingStatus,
        isFree,
        attendance,
        attendanceStatus,
        joinedAt,
        lastJoinedAt,
        recordingUrl: session.recordingUrl || null,
        materials: session.materials || null,
        liveClass
      };
    });

    const activeSessionMappedClasses = sessionMappedClasses.filter(cls => {
      if (cls.isRecurring && cls.todayStatus === "not_scheduled") {
        return false;
      }
      return true;
    });

    res.status(200).json({
      success: true,
      data: [...enrichedClasses, ...activeSessionMappedClasses],
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

    let dbLiveClass = null;
    const classIdInt = parseInt(classId, 10);
    if (!isNaN(classIdInt)) {
      dbLiveClass = await prisma.liveClass.findUnique({
        where: { id: classIdInt },
      });
    }

    if (dbLiveClass) {
      if (dbLiveClass.thumbnail) {
        dbLiveClass.thumbnail = dbLiveClass.thumbnail.startsWith("http://") || dbLiveClass.thumbnail.startsWith("https://") ? dbLiveClass.thumbnail : `${req.protocol}://${req.get("host")}/${dbLiveClass.thumbnail.replace(/\\/g, "/")}`;
      }
      return res.status(200).json({
        success: true,
        data: {
          ...dbLiveClass,
          isRecurring: dbLiveClass.isRecurring,
          recurrenceType: dbLiveClass.recurrenceType
        },
      });
    }

    // Try finding in LiveSession for backwards compatibility
    const studentId = parseInt(req.user.id);
    const activeCourseBookings = await prisma.booking.findMany({
      where: { studentId, accessScope: "course", status: "paid" },
      select: { courseId: true }
    });
    const activeCourseIds = new Set(activeCourseBookings.map(b => b.courseId).filter(Boolean));

    const session = await prisma.liveSession.findUnique({
      where: { id: classId },
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
    const attendanceRecord = session.attendances && session.attendances.length > 0 ? session.attendances[0] : null;
    const isJoined = attendanceRecord ? true : false;

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

    const hasCourseAccess = activeCourseIds.has(session.courseId);
    const hasPaidBooking = session.billingBookings.some(b => b.status === "paid") || hasCourseAccess;
    const latestBooking = session.billingBookings.length > 0 ? session.billingBookings[0] : null;
    let bookingStatus = hasPaidBooking ? "paid" : (latestBooking ? latestBooking.status : null);
    if (hasCourseAccess) {
      bookingStatus = "paid";
    }
    const isPaid = hasPaidBooking;
    const priceInPaise = session.priceInPaise !== undefined ? session.priceInPaise : null;
    const pricing = session.pricing || null;
    let paymentRequired = hasCourseAccess ? false : (priceInPaise !== null || (pricing ? pricing.isActive : false));

    let sessionStatus = session.status;
    if (categoryRecord && categoryRecord.status && categoryRecord.status !== "active") {
      sessionStatus = categoryRecord.status;
    }
    if (sessionStatus === "ended" || sessionStatus === "completed" || sessionStatus === "cancelled") {
      paymentRequired = false;
    }

    legacyStatus = "upcoming";
    if (todayStatus === "live" || todayStatus === "join_open") {
      legacyStatus = "live";
    } else if (todayStatus === "completed_today" || todayStatus === "ended" || sessionStatus === "ended" || sessionStatus === "completed") {
      legacyStatus = "completed";
    } else if (todayStatus === "paused") {
      legacyStatus = "paused";
    } else if (todayStatus === "cancelled" || todayStatus === "cancelled_today" || sessionStatus === "cancelled") {
      legacyStatus = "cancelled";
    }

    const isFree = !paymentRequired;

    const attendance = attendanceRecord ? {
      id: attendanceRecord.id,
      status: attendanceRecord.status,
      firstJoinedAt: attendanceRecord.firstJoinedAt,
      lastJoinedAt: attendanceRecord.lastJoinedAt,
      joinCount: attendanceRecord.joinCount,
      totalDurationSeconds: attendanceRecord.totalDurationSeconds,
      attendanceStatus: attendanceRecord.status
    } : null;
    const attendanceStatus = attendanceRecord ? attendanceRecord.status : null;
    const joinedAt = attendanceRecord ? (attendanceRecord.joinedAt || attendanceRecord.firstJoinedAt) : null;
    const lastJoinedAt = attendanceRecord ? attendanceRecord.lastJoinedAt : null;

    const liveClass = {
      id: session.id,
      courseId: session.courseId,
      courseAccessId: session.courseId,
      title: session.title,
      scheduledAt,
      endsAt,
      durationMinutes,
      meetUrl: session.meetingLink || "",
      status: sessionStatus,
      isPaid,
      paymentRequired
    };

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
        trainerCourseId: session.courseId,
        courseAccessId: session.courseId,
        trainerId: `trainer_${session.trainerId}`,
        title: session.title,
        subtitle: session.subtitle,
        timezone: session.timezone,
        todayStatus: todayStatus,
        cancellationReason: null,
        isAddedToCard: session.cards.length > 0,
        isJoined: isJoined,
        isPaid,
        hasCourseAccess,
        paymentRequired,
        bookingStatus,
        isFree,
        attendance,
        attendanceStatus,
        joinedAt,
        lastJoinedAt,
        recordingUrl: session.recordingUrl || null,
        materials: session.materials || null,
        liveClass
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

    let whereClause = {
      AND: [
        {
          OR: [
            { status: { not: "ended" } },
            {
              attendances: {
                some: {
                  studentId: studentId
                }
              }
            }
          ]
        },
        {
          OR: [
            { sectionType: { not: "TIT" } },
            { sectionType: null }
          ]
        }
      ]
    };

    if (category) {
      whereClause = {
        AND: [
          whereClause,
          { courseId: category }
        ]
      };
    }

    if (search) {
      whereClause = {
        AND: [
          whereClause,
          { title: { contains: search, mode: "insensitive" } }
        ]
      };
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

    const activeCourseBookings = await prisma.booking.findMany({
      where: { studentId, accessScope: "course", status: "paid" },
      select: { courseId: true }
    });
    const activeCourseIds = new Set(activeCourseBookings.map(b => b.courseId).filter(Boolean));

    const categories = await prisma.category.findMany();
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    let formattedSessions = sessions.map(session => formatSession(session, categoryMap, studentId, req, activeCourseIds));

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

    const activeCourseBookings = await prisma.booking.findMany({
      where: { studentId, accessScope: "course", status: "paid" },
      select: { courseId: true }
    });
    const activeCourseIds = new Set(activeCourseBookings.map(b => b.courseId).filter(Boolean));

    const categories = await prisma.category.findMany();
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    res.status(200).json({
      success: true,
      message: "Session details fetched successfully",
      data: formatSession(session, categoryMap, studentId, req, activeCourseIds)
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

    const activeCourseBookings = await prisma.booking.findMany({
      where: { studentId, accessScope: "course", status: "paid" },
      select: { courseId: true }
    });
    const activeCourseIds = new Set(activeCourseBookings.map(b => b.courseId).filter(Boolean));

    const categories = await prisma.category.findMany();
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    const formattedCards = cards.map(card => {
      const session = card.session;
      const sessionEnriched = {
        ...session,
        cards: [card]
      };
      const formatted = formatSession(sessionEnriched, categoryMap, studentId, req, activeCourseIds);
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
    // 3. Support lookup by id, _id, sessionId, and session_id (both in params and body)
    const sessionId = req.params.sessionId || req.params.id || (req.body ? (req.body.sessionId || req.body.session_id || req.body.id || req.body._id) : null);
    
    const studentId = parseInt(req.user?.id || req.user);
    if (isNaN(studentId)) {
      return res.status(400).json({ success: false, message: "Invalid student identifier." });
    }

    if (!sessionId) {
      return res.status(400).json({ success: false, message: "sessionId is required." });
    }

    const session = await prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: {
        pricing: true,
      }
    });

    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found." });
    }

    // 7. If session is unpublished, return clear message.
    if (session.publishState !== "PUBLISHED") {
      return res.status(400).json({ success: false, message: "This session is not published." });
    }

    // 7. If session is cancelled or completed (ended), return clear message.
    if (session.status === "cancelled") {
      return res.status(400).json({ success: false, message: "This session has been cancelled." });
    }
    if (session.status === "ended") {
      return res.status(400).json({ success: false, message: "This session has already ended." });
    }
    if (session.status !== "active") {
      return res.status(400).json({ success: false, message: `Cannot join. Session is ${session.status}.` });
    }

    const now = new Date();
    const { clientJoinedAt } = req.body || {};
    const joinedAtTime = clientJoinedAt ? new Date(clientJoinedAt) : now;
    if (isNaN(joinedAtTime.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid clientJoinedAt format." });
    }

    // 8. Confirm frontend request body fields are accepted: sessionDate, scheduledAt, startsAt, endsAt, occurrenceDate
    let resolvedDateInput = null;
    if (req.body) {
      resolvedDateInput = req.body.sessionDate || req.body.scheduledAt || req.body.startsAt || req.body.endsAt || req.body.occurrenceDate;
    }

    const parseToKolkataDateString = (input) => {
      if (!input) return null;
      const str = String(input).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        return str;
      }
      try {
        const d = new Date(input);
        if (!isNaN(d.getTime())) {
          const formatter = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          });
          return formatter.format(d);
        }
      } catch (e) {}
      return null;
    };

    const targetDateStr = parseToKolkataDateString(resolvedDateInput) || session.scheduledDate || getKolkataDateString(now);
    const targetDate = new Date(targetDateStr);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid session date format." });
    }
    targetDate.setUTCHours(0, 0, 0, 0);

    // Verify if the session is scheduled on this weekday
    if (!matchesRecurringDays(session, targetDate)) {
      return res.status(400).json({
        success: false,
        message: "Cannot join. This session is not scheduled to occur on this weekday."
      });
    }

    // Check if the session is cancelled for today in cancelledDates
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
    if (Array.isArray(cancelledArray) && cancelledArray.includes(targetDateStr)) {
      return res.status(400).json({ success: false, message: "This session has been cancelled for today." });
    }

    // 4. Validate join window using latest scheduledAt/endsAt in Asia/Kolkata
    const startKolkataTime = session.startTime || "00:00";
    const endKolkataTime = session.endTime || "23:59";
    const scheduledAtTime = getKolkataDateTime(targetDateStr, startKolkataTime);
    const endsAtTime = getKolkataDateTime(targetDateStr, endKolkataTime);

    // 6. If class is not open, return message with actual open time.
    const joinOpenTime = new Date(scheduledAtTime.getTime() - 5 * 60 * 1000);
    if (now < joinOpenTime) {
      const openTimeStr = joinOpenTime.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: '2-digit', minute: '2-digit', hour12: true });
      return res.status(400).json({
        success: false,
        message: `Class is not open yet. You can join 5 minutes before the start time. Join opens at ${openTimeStr}.`
      });
    }

    // 7. If session is completed, return clear message.
    if (now > endsAtTime) {
      return res.status(400).json({
        success: false,
        message: "This session has already completed."
      });
    }

    const isFree =
      session.pricingState === "FREE" ||
      session.pricingState === "PENDING_PRICE" ||
      !session.priceInPaise ||
      session.priceInPaise <= 0;

    let hasCourseAccess = false;
    if (session.courseId) {
      const activeCourseBooking = await prisma.booking.findFirst({
        where: {
          studentId,
          courseId: session.courseId,
          accessScope: "course",
          status: "paid"
        }
      });
      if (activeCourseBooking) {
        hasCourseAccess = true;
      }
    }

    let booking = await prisma.booking.findFirst({
      where: {
        studentId,
        sessionId: session.id,
        status: isFree ? { in: ["joined", "completed", "paid"] } : { in: ["paid", "joined", "completed"] }
      },
      orderBy: { createdAt: "desc" }
    });

    if (!booking && hasCourseAccess) {
      booking = await prisma.booking.findFirst({
        where: {
          studentId,
          sessionId: session.id,
          status: { in: ["paid", "joined", "completed"] }
        },
        orderBy: { createdAt: "desc" }
      });
      if (!booking) {
        booking = await prisma.booking.create({
          data: {
            studentId,
            sessionId: session.id,
            sessionDate: targetDate,
            amountPaise: 0,
            currency: "INR",
            status: "joined",
            accessScope: "session",
            courseId: session.courseId
          }
        });
      }
    }

    if (!booking) {
      if (isFree) {
        booking = await prisma.booking.create({
          data: {
            studentId,
            sessionId: session.id,
            sessionDate: targetDate,
            amountPaise: 0,
            currency: "INR",
            status: "joined"
          }
        });
      } else {
        // 5. If payment is required, return message: "Payment required before joining."
        return res.status(400).json({
          success: false,
          message: "Payment required before joining."
        });
      }
    } else {
      if (booking.status === "paid") {
        booking = await prisma.booking.update({
          where: { id: booking.id },
          data: { status: "joined" }
        });
      }
    }

    // Calculate attendance rules: graceEndTime is scheduledAtTime + 15 minutes
    const graceEndTime = new Date(scheduledAtTime.getTime() + 15 * 60 * 1000);
    const resolvedStatus = joinedAtTime <= graceEndTime ? "joined" : "late";

    // 1. Find or create SessionOccurrence
    let occurrence = await prisma.sessionOccurrence.findUnique({
      where: {
        sessionId_occurrenceDate: {
          sessionId: session.id,
          occurrenceDate: targetDate
        }
      }
    });

    if (!occurrence) {
      occurrence = await prisma.sessionOccurrence.create({
        data: {
          courseId: session.courseId || "default",
          sessionId: session.id,
          trainerId: session.trainerId,
          occurrenceDate: targetDate,
          startsAt: scheduledAtTime,
          endsAt: endsAtTime,
          status: "scheduled"
        }
      });
    }

    // 2. Create or update StudentAttendance
    let studentAttendance = await prisma.studentAttendance.findUnique({
      where: {
        occurrenceId_studentId: {
          occurrenceId: occurrence.id,
          studentId: studentId
        }
      }
    });

    if (studentAttendance) {
      studentAttendance = await prisma.studentAttendance.update({
        where: { id: studentAttendance.id },
        data: {
          joinCount: studentAttendance.joinCount + 1,
          lastJoinedAt: joinedAtTime,
          status: resolvedStatus
        }
      });
    } else {
      studentAttendance = await prisma.studentAttendance.create({
        data: {
          courseId: session.courseId || "default",
          sessionId: session.id,
          occurrenceId: occurrence.id,
          occurrenceDate: targetDate,
          studentId: studentId,
          trainerId: session.trainerId,
          firstJoinedAt: joinedAtTime,
          lastJoinedAt: joinedAtTime,
          joinCount: 1,
          status: resolvedStatus,
          source: "join_button"
        }
      });
    }

    // 3. Create or update Attendance
    let attendance = await prisma.attendance.findFirst({
      where: {
        studentId,
        sessionId: session.id,
        occurrenceDate: targetDate
      }
    });

    let isAlreadyJoined = false;
    if (attendance) {
      isAlreadyJoined = true;
      attendance = await prisma.attendance.update({
        where: { id: attendance.id },
        data: {
          joinCount: attendance.joinCount + 1,
          lastJoinedAt: joinedAtTime,
          isJoined: true,
          status: resolvedStatus
        }
      });
    } else {
      attendance = await prisma.attendance.create({
        data: {
          studentId,
          sessionId: session.id,
          occurrenceDate: targetDate,
          status: resolvedStatus,
          firstJoinedAt: joinedAtTime,
          lastJoinedAt: joinedAtTime,
          joinCount: 1,
          totalDurationSeconds: 0,
          isJoined: true
        }
      });
    }

    const openEvents = await prisma.attendanceEvent.findMany({
      where: { studentId, sessionId: session.id, leftAt: null }
    });
    for (const event of openEvents) {
      const durationSeconds = Math.max(0, Math.floor((now.getTime() - event.joinedAt.getTime()) / 1000));
      await prisma.attendanceEvent.update({
        where: { id: event.id },
        data: {
          leftAt: now,
          durationSeconds
        }
      });
    }

    await prisma.attendanceEvent.create({
      data: {
        attendanceId: attendance.id,
        studentId,
        sessionId: session.id,
        occurrenceDate: targetDate,
        joinedAt: joinedAtTime
      }
    });

    const responseData = {
      bookingId: booking.id,
      sessionId: session.id,
      studentId: `student_${studentId}`,
      meetingLink: session.meetingLink || "",
      joinedAt: joinedAtTime.toISOString(),
      attendance: {
        attendanceStatus: attendance.status,
        firstJoinedAt: attendance.firstJoinedAt.toISOString(),
        lastJoinedAt: attendance.lastJoinedAt.toISOString(),
        joinCount: attendance.joinCount,
        occurrenceDate: getKolkataDateString(attendance.occurrenceDate)
      }
    };

    if (isAlreadyJoined) {
      return res.status(200).json({
        success: true,
        message: "Already joined",
        data: responseData
      });
    }

    return res.status(200).json({
      success: true,
      message: "Session joined successfully",
      data: responseData
    });
  } catch (error) {
    console.error("Join Session Error Stack:", error.stack || error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to join session."
    });
  }
};

const heartbeatSession = async (req, res) => {
  try {
    const studentId = parseInt(req.user?.id || req.user);
    if (isNaN(studentId)) {
      return res.status(400).json({ success: false, message: "Invalid student identifier." });
    }

    const sessionId = req.body.sessionId || req.params.sessionId;
    const { occurrenceDate, clientHeartbeatAt } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({ success: false, message: "sessionId is required." });
    }
    if (!occurrenceDate) {
      return res.status(400).json({ success: false, message: "occurrenceDate is required." });
    }

    const targetDate = new Date(occurrenceDate);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid occurrenceDate format." });
    }
    targetDate.setUTCHours(0, 0, 0, 0);

    const attendance = await prisma.attendance.findFirst({
      where: {
        studentId,
        sessionId,
        occurrenceDate: targetDate
      }
    });

    if (!attendance) {
      return res.status(400).json({ success: false, message: "No attendance record found for this session and date." });
    }

    const heartbeatTime = clientHeartbeatAt ? new Date(clientHeartbeatAt) : new Date();
    if (isNaN(heartbeatTime.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid clientHeartbeatAt format." });
    }

    let latestEvent = await prisma.attendanceEvent.findFirst({
      where: { attendanceId: attendance.id, leftAt: null },
      orderBy: { joinedAt: "desc" }
    });

    if (!latestEvent) {
      latestEvent = await prisma.attendanceEvent.create({
        data: {
          attendanceId: attendance.id,
          studentId,
          sessionId,
          occurrenceDate: targetDate,
          joinedAt: heartbeatTime
        }
      });
    }

    const eventDurationSeconds = Math.max(0, Math.floor((heartbeatTime.getTime() - latestEvent.joinedAt.getTime()) / 1000));
    
    await prisma.attendanceEvent.update({
      where: { id: latestEvent.id },
      data: { durationSeconds: eventDurationSeconds }
    });

    const allEvents = await prisma.attendanceEvent.findMany({
      where: { attendanceId: attendance.id }
    });
    
    const totalSeconds = allEvents.reduce((sum, e) => sum + e.durationSeconds, 0);

    let newStatus = attendance.status;
    if (totalSeconds >= 600) {
      const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
      let graceEndTime = new Date(attendance.occurrenceDate);
      if (session && session.startTime) {
        graceEndTime = getKolkataDateTime(getKolkataDateString(attendance.occurrenceDate), session.startTime);
      }
      graceEndTime = new Date(graceEndTime.getTime() + 15 * 60 * 1000);

      if (attendance.status === "pending") {
        if (attendance.firstJoinedAt <= graceEndTime) {
          newStatus = "present";
        } else {
          newStatus = "late";
        }
      }
    }

    const updatedAttendance = await prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        totalDurationSeconds: totalSeconds,
        status: newStatus
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        attendance: {
          attendanceStatus: updatedAttendance.status,
          firstJoinedAt: updatedAttendance.firstJoinedAt.toISOString(),
          lastJoinedAt: updatedAttendance.lastJoinedAt.toISOString(),
          lastHeartbeatAt: heartbeatTime.toISOString(),
          joinCount: updatedAttendance.joinCount,
          occurrenceDate: getKolkataDateString(updatedAttendance.occurrenceDate)
        }
      }
    });
  } catch (error) {
    console.error("Heartbeat Session Fatal Error Stack:", error.stack || error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to process heartbeat."
    });
  }
};

const leaveSession = async (req, res) => {
  try {
    const studentId = parseInt(req.user?.id || req.user);
    if (isNaN(studentId)) {
      return res.status(400).json({ success: false, message: "Invalid student identifier." });
    }

    const sessionId = req.body.sessionId || req.params.sessionId;
    const { occurrenceDate, clientLeftAt } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({ success: false, message: "sessionId is required." });
    }
    if (!occurrenceDate) {
      return res.status(400).json({ success: false, message: "occurrenceDate is required." });
    }

    const targetDate = new Date(occurrenceDate);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid occurrenceDate format." });
    }
    targetDate.setUTCHours(0, 0, 0, 0);

    const attendance = await prisma.attendance.findFirst({
      where: {
        studentId,
        sessionId,
        occurrenceDate: targetDate
      }
    });

    if (!attendance) {
      return res.status(400).json({ success: false, message: "No attendance record found for this session and date." });
    }

    const leaveTime = clientLeftAt ? new Date(clientLeftAt) : new Date();
    if (isNaN(leaveTime.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid clientLeftAt format." });
    }

    const latestEvent = await prisma.attendanceEvent.findFirst({
      where: { attendanceId: attendance.id, leftAt: null },
      orderBy: { joinedAt: "desc" }
    });

    if (latestEvent) {
      const eventDurationSeconds = Math.max(0, Math.floor((leaveTime.getTime() - latestEvent.joinedAt.getTime()) / 1000));
      await prisma.attendanceEvent.update({
        where: { id: latestEvent.id },
        data: {
          leftAt: leaveTime,
          durationSeconds: eventDurationSeconds
        }
      });
    }

    const allEvents = await prisma.attendanceEvent.findMany({
      where: { attendanceId: attendance.id }
    });
    const totalSeconds = allEvents.reduce((sum, e) => sum + e.durationSeconds, 0);

    let newStatus = attendance.status;
    if (totalSeconds >= 600) {
      const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
      let graceEndTime = new Date(attendance.occurrenceDate);
      if (session && session.startTime) {
        graceEndTime = getKolkataDateTime(getKolkataDateString(attendance.occurrenceDate), session.startTime);
      }
      graceEndTime = new Date(graceEndTime.getTime() + 15 * 60 * 1000);

      if (attendance.status === "pending") {
        if (attendance.firstJoinedAt <= graceEndTime) {
          newStatus = "present";
        } else {
          newStatus = "late";
        }
      }
    }

    const updatedAttendance = await prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        totalDurationSeconds: totalSeconds,
        status: newStatus
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        attendance: {
          attendanceStatus: updatedAttendance.status,
          firstJoinedAt: updatedAttendance.firstJoinedAt.toISOString(),
          lastJoinedAt: updatedAttendance.lastJoinedAt.toISOString(),
          lastHeartbeatAt: leaveTime.toISOString(),
          joinCount: updatedAttendance.joinCount,
          occurrenceDate: getKolkataDateString(updatedAttendance.occurrenceDate)
        }
      }
    });
  } catch (error) {
    console.error("Leave Session Fatal Error Stack:", error.stack || error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to leave session."
    });
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

    const activeCourseBookings = await prisma.booking.findMany({
      where: { studentId, accessScope: "course", status: "paid" },
      select: { courseId: true }
    });
    const activeCourseIds = new Set(activeCourseBookings.map(b => b.courseId).filter(Boolean));

    const categories = await prisma.category.findMany();
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    const formattedBookings = attendances.map(att => {
      const session = att.session;
      const formatted = formatSession(session, categoryMap, studentId, req, activeCourseIds);
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
    const { sessionDate, accessScope, courseId } = req.body;
    const studentId = parseInt(req.user.id);

    console.log(`[BOOKING] Initiating booking for session ${sessionId} by student ${studentId}`);

    if (!sessionDate) {
      return res.status(400).json({ success: false, message: "sessionDate is required." });
    }

    // 1. Session Lookup & Pricing State Check
    const session = await prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: { pricing: true }
    });

    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found." });
    }

    const isFree = session.pricingState === "FREE" || session.pricingState === "PENDING_PRICE" || !session.priceInPaise || session.priceInPaise <= 0;

    if (isFree) {
      console.log(`[BOOKING] Session ${sessionId} is free. Booking flow rejected.`);
      return res.status(400).json({ success: false, message: "This session is free. No booking required." });
    }

    const amountPaise = session.priceInPaise;
    const currency = "INR";

    const scope = accessScope || "session";
    const targetCourseId = courseId || session.courseId;

    // 2. Paid-access check
    console.log(`[BOOKING] Checking active paid access for student ${studentId} on course/session`);
    if (targetCourseId) {
      const activeCourseBooking = await prisma.booking.findFirst({
        where: {
          studentId,
          courseId: targetCourseId,
          accessScope: "course",
          status: "paid"
        }
      });
      if (activeCourseBooking) {
        console.log(`[BOOKING] Student ${studentId} already has active course access for course ${targetCourseId}`);
        return res.status(409).json({
          success: false,
          alreadyPaid: true,
          alreadyPurchased: true,
          message: "You already have active access for this course.",
          bookingStatus: "paid",
          paymentRequired: false,
          courseId: targetCourseId
        });
      }
    }

    if (scope === "session") {
      const existingPaidBooking = await prisma.booking.findFirst({
        where: {
          studentId,
          sessionId,
          status: "paid"
        }
      });

      if (existingPaidBooking) {
        console.log(`[BOOKING] Student ${studentId} already has active access to session ${sessionId}`);
        return res.status(409).json({
          success: false,
          alreadyPaid: true,
          message: "You already have active access for this session.",
          bookingStatus: "paid",
          paymentRequired: false,
          sessionId
        });
      }
    }

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.error("[BOOKING] Missing Razorpay credentials in environment variables.");
      return res.status(500).json({ success: false, message: "Server configuration error regarding payment gateway." });
    }

    const bookingDate = new Date(sessionDate);

    // Create Booking row (pending_payment)
    const booking = await prisma.booking.create({
      data: {
        studentId,
        sessionId,
        sessionDate: bookingDate,
        amountPaise,
        currency,
        status: "pending_payment",
        accessScope: scope,
        courseId: targetCourseId || null
      }
    });

    // Request payment token from Razorpay
    console.log(`[BOOKING] Creating Razorpay order for booking ${booking.id}`);
    const orderOptions = {
      amount: amountPaise,
      currency: currency,
      receipt: `rcpt_${booking.id.substring(0, 20)}`,
      notes: {
        bookingId: booking.id,
        sessionId: sessionId,
        studentId: studentId.toString(),
        sessionDate: sessionDate,
        accessScope: scope,
        courseId: targetCourseId || null
      }
    };

    let razorpayOrder;
    try {
      razorpayOrder = await razorpay.orders.create(orderOptions);
    } catch (rzpError) {
      console.error("[BOOKING] Razorpay order creation failed:", rzpError);
      return res.status(502).json({ success: false, message: "Failed to communicate with payment gateway.", error: rzpError.message });
    }

    // Create tracking Payment row
    await prisma.payment.create({
      data: {
        bookingId: booking.id,
        studentId,
        sessionId,
        razorpayOrderId: razorpayOrder.id,
        amountPaise,
        currency,
        status: "created"
      }
    });

    // Fetch student details
    const studentUser = await prisma.user.findUnique({
      where: { id: studentId },
      select: { fullName: true, email: true, phoneNumber: true }
    });

    console.log(`[BOOKING] Successfully created order for booking ${booking.id}`);

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
        },
        accessScope: booking.accessScope,
        courseId: booking.courseId
      }
    });
  } catch (error) {
    console.error("[BOOKING] Create Booking Fatal Error:", error);
    return res.status(500).json({ success: false, message: "Failed to create booking. An internal error occurred." });
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
          where: { id: booking.sessionId },
          include: { trainer: true }
        });

        if (session) {
          const trainerSharePercentage = sessionPricing.trainerSharePercent;
          const grossAmountPaise = booking.amountPaise;
          const trainerEarningPaise = Math.round(grossAmountPaise * (trainerSharePercentage / 100));
          const platformSharePercentage = 100 - trainerSharePercentage;
          const platformEarningPaise = grossAmountPaise - trainerEarningPaise;

          const sessionEnd = new Date(booking.sessionDate);
          sessionEnd.setHours(sessionEnd.getHours() + 2); // available after 2 hours

          const existingEarning = await tx.trainerEarning.findFirst({
            where: { bookingId: booking.id }
          });

          if (!existingEarning && session.trainer) {
            await tx.trainerEarning.create({
              data: {
                trainerId: session.trainerId,
                trainerName: session.trainer.fullName || "Trainer",
                trainerEmail: session.trainer.email || "",
                sessionId: booking.sessionId,
                sessionTitle: session.title || "Live Session",
                paidStudentCount: 1,
                sessionPricePaise: sessionPricing.amountPaise,
                grossRevenuePaise: grossAmountPaise,
                trainerSharePercentage,
                trainerEarningPaise,
                platformSharePercentage,
                platformEarningPaise,
                refundAdjustmentPaise: 0,
                finalPayablePaise: trainerEarningPaise,
                status: "unpaid",
                lockedAmountPaise: 0,
                
                // Legacy fields
                sessionDate: booking.sessionDate,
                bookingId: booking.id,
                paymentId: updatedPayment.id,
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

    const attendance = await prisma.attendance.findMany({
      where: { 
        session: { courseId },
        studentId 
      },
      include: { session: true },
      orderBy: { occurrenceDate: "desc" }
    });

    return res.status(200).json({ success: true, data: attendance });
  } catch (error) {
    console.error("Get Course Attendance Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch attendance." });
  }
};

const getSessionAttendance = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const studentId = parseInt(req.user.id);

    const attendance = await prisma.attendance.findMany({
      where: { sessionId, studentId },
      include: { session: true },
      orderBy: { occurrenceDate: "desc" }
    });

    return res.status(200).json({ success: true, data: attendance });
  } catch (error) {
    console.error("Get Session Attendance Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch session attendance." });
  }
};

const getStudentAttendance = async (req, res) => {
  try {
    const studentId = parseInt(req.user.id);
    const attendance = await prisma.attendance.findMany({
      where: { studentId },
      include: {
        session: { select: { title: true, courseId: true, courseTitle: true } }
      },
      orderBy: { occurrenceDate: "desc" }
    });

    const formattedData = attendance.map(a => ({
      id: a.id,
      sessionId: a.sessionId,
      studentId: a.studentId,
      occurrenceDate: a.occurrenceDate,
      firstJoinedAt: a.firstJoinedAt,
      lastJoinedAt: a.lastJoinedAt,
      joinCount: a.joinCount,
      totalDurationSeconds: a.totalDurationSeconds,
      status: a.status,
      sessionTitle: a.session?.title || "Unknown Session",
      courseId: a.session?.courseId || null,
      courseTitle: a.session?.courseTitle || null
    }));

    return res.status(200).json({ success: true, data: formattedData });
  } catch (error) {
    console.error("Get Student Attendance Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch student attendance." });
  }
};

const getStudentTITClasses = async (req, res) => {
  try {
    const classes = await prisma.liveSession.findMany({
      where: {
        sectionType: "TIT",
        source: "admin_tit_classes",
        publishState: "PUBLISHED",
      },
      include: {
        trainer: { select: { fullName: true } }
      },
      orderBy: { scheduledAt: "asc" },
    });

    const formatted = classes.map((cls) => {
      let thumbnail = cls.thumbnail;
      if (thumbnail && !thumbnail.startsWith("http")) {
        thumbnail = `${req.protocol}://${req.get("host")}/${thumbnail.replace(/\\/g, "/")}`;
      }

      const isFree = cls.pricingState === "FREE" || cls.priceInPaise === 0 || !cls.priceInPaise;

      return {
        id: cls.id,
        courseId: cls.courseId,
        courseName: cls.courseTitle || cls.category || "Live Session",
        title: cls.title || "",
        classTitle: cls.classTitle || cls.title || "",
        instructor: cls.trainer?.fullName || "Trainer",
        description: cls.description || "",
        date: cls.scheduledDate || "",
        startTime: cls.startTime || "",
        endTime: cls.endTime || "",
        time: cls.startTime || "",
        duration: cls.durationMinutes ? `${cls.durationMinutes} mins` : "",
        meetingLink: cls.meetingLink || "",
        meetLink: cls.meetingLink || "",
        thumbnail: thumbnail,
        priceInPaise: cls.priceInPaise || 0,
        currency: "INR",
        isFree,
        publishState: cls.publishState,
        pricingState: cls.pricingState
      };
    });

    return res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    console.error("Get Student TIT Classes Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to fetch TIT classes.",
    });
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
  getSessionAttendance,
  getStudentAttendance,
  heartbeatSession,
  leaveSession,
  formatSession,
  getStudentTITClasses,
};

