const prisma = require("../config/db");
const { generateOccurrences } = require("../services/occurrenceService");

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

// Helper: build response shape for session
const formatSession = (session, categoryMap = new Map(), req = null) => {
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

  let thumbnail = session.thumbnail || null;
  if (thumbnail && req && !thumbnail.startsWith("http://") && !thumbnail.startsWith("https://")) {
    thumbnail = `${req.protocol}://${req.get("host")}/${thumbnail.replace(/\\/g, "/")}`;
  }

  return {
    id: session.id,
    courseId: session.courseId,
    trainerCourseId: session.courseId,
    courseAccessId: session.courseId,
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
    isAddedToCard: false,
    isJoined: false,
    cancelledDates: session.cancelledDates,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    endedAt: session.endedAt,
    priceInPaise: session.priceInPaise !== undefined ? session.priceInPaise : null,
    pricingState: session.pricingState,
    publishState: session.publishState,
    trainerSharePercentage: session.trainerSharePercentage !== undefined ? session.trainerSharePercentage : 50,
    enableWhatsApp: session.enableWhatsApp,
    whatsappTemplateName: session.whatsappTemplateName,
    whatsappCustomTitle: session.whatsappCustomTitle,
    whatsappButtonUrl: session.whatsappButtonUrl,
    trainerInstructions: session.trainerInstructions,
    recurringDays: session.recurringDays,
  };
};

// ─────────────────────────────────────────────
// @desc    Get logged-in trainer activation status
// @route   GET /api/trainer/status
// @access  Private/Trainer
// ─────────────────────────────────────────────
const getTrainerStatus = async (req, res) => {
  try {
    if (!req.user || !req.user.role || String(req.user.role).toUpperCase() !== "TRAINER") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Logged-in user is not a trainer.",
      });
    }

    const trainerId = Number.parseInt(req.user.id, 10);

    if (!Number.isInteger(trainerId) || trainerId <= 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication payload.",
      });
    }

    const trainer = await prisma.user.findFirst({
      where: {
        id: trainerId,
        role: "TRAINER",
      },
      select: {
        isActive: true,
      },
    });

    if (!trainer) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Trainer not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        isActive: trainer.isActive === true,
      },
    });
  } catch (error) {
    console.error("getTrainerStatus Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to fetch trainer status.",
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Get Trainer Courses (fetched from Category table)
// @route   GET /api/trainer/courses
// @access  Private/Trainer
// ─────────────────────────────────────────────
const getTrainerCourses = async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" }
    });
    const courses = categories.map(cat => ({
      id: cat.id,
      title: cat.name,
      category: cat.description || "Frontend Development",
      subtitle: "Daily practical session"
    }));
    return res.status(200).json({
      success: true,
      data: courses
    });
  } catch (error) {
    console.error("getTrainerCourses Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to fetch courses."
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Create a new session
// @route   POST /api/trainer/sessions
// @access  Private/Trainer
// ─────────────────────────────────────────────
const createSession = async (req, res) => {
  try {
    const trainerId = Number.parseInt(req.user.id, 10);

    if (!Number.isInteger(trainerId) || trainerId <= 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication payload.",
      });
    }

    const trainer = await prisma.user.findFirst({
      where: {
        id: trainerId,
        role: "TRAINER",
      },
      select: {
        isActive: true,
      },
    });

    if (!trainer) {
      return res.status(404).json({
        success: false,
        message: "Trainer not found.",
      });
    }

    if (trainer.isActive === false) {
      return res.status(403).json({
        success: false,
        message: "Action restricted. Inactive trainers cannot create classes.",
      });
    }

    const {
      courseId,
      courseTitle,
      category,
      title,
      subtitle,
      description,
      startTime,
      endTime,
      timezone,
      meetingLink,
      recurrenceType,
    } = req.body;

    const isRecurring = req.body.isRecurring === true || req.body.isRecurring === "true";

    // Validate fields
    if ((!courseId && (!courseTitle || !category)) || !title || !startTime || !endTime || !meetingLink) {
      return res.status(400).json({
        success: false,
        message: "Required fields: courseId (or courseTitle and category), title, startTime, endTime, meetingLink.",
      });
    }

    let resolvedCourseId = null;
    let resolvedCourseTitle = null;
    let resolvedCategory = null;

    if (courseId) {
      const categoryRecord = await prisma.category.findUnique({
        where: { id: courseId }
      });
      if (categoryRecord) {
        resolvedCourseId = categoryRecord.id;
        resolvedCourseTitle = categoryRecord.name;
        resolvedCategory = categoryRecord.description || "Frontend Development";
      } else {
        if (courseTitle && category) {
          resolvedCourseTitle = courseTitle;
          resolvedCategory = category;
        } else {
          return res.status(400).json({
            success: false,
            message: "Invalid courseId and no manual courseTitle/category provided.",
          });
        }
      }
    } else {
      resolvedCourseTitle = courseTitle;
      resolvedCategory = category;

      // Try to find a matching category by name
      const existingCategory = await prisma.category.findFirst({
        where: { name: { equals: courseTitle, mode: 'insensitive' } }
      });
      if (existingCategory) {
        resolvedCourseId = existingCategory.id;
      }
    }

    let thumbnail = null;
    if (req.file) {
      thumbnail = req.file.path;
    } else if (req.body.thumbnail && req.body.thumbnail !== "null" && req.body.thumbnail !== "undefined") {
      thumbnail = req.body.thumbnail;
    }

    let enableWhatsAppValue = true;
    if (req.body.enableWhatsApp !== undefined) {
      enableWhatsAppValue = req.body.enableWhatsApp === true || req.body.enableWhatsApp === "true";
    }

    let parsedRecurringDays = null;
    if (req.body.recurringDays) {
      if (typeof req.body.recurringDays === "string") {
        try {
          parsedRecurringDays = JSON.parse(req.body.recurringDays);
        } catch (e) {
          parsedRecurringDays = req.body.recurringDays;
        }
      } else {
        parsedRecurringDays = req.body.recurringDays;
      }
    }

    const session = await prisma.liveSession.create({
      data: {
        courseId: resolvedCourseId,
        courseTitle: resolvedCourseTitle,
        category: resolvedCategory,
        trainerId,
        title,
        subtitle: subtitle || null,
        description: description || null,
        startTime,
        endTime,
        timezone: timezone || "Asia/Kolkata",
        meetingLink,
        isRecurring,
        recurrenceType: isRecurring ? recurrenceType : null,
        status: "active",
        cancelledDates: [],
        thumbnail,
        pricingState: "PENDING_PRICE",
        publishState: "DRAFT",
        enableWhatsApp: enableWhatsAppValue,
        whatsappTemplateName: req.body.whatsappTemplateName || null,
        whatsappCustomTitle: req.body.whatsappCustomTitle || null,
        whatsappButtonUrl: req.body.whatsappButtonUrl || null,
        trainerInstructions: req.body.trainerInstructions || null,
        recurringDays: parsedRecurringDays,
      },
      include: { trainer: true },
    });

    // Automatically generate SessionOccurrence records so reminder Job works
    await generateOccurrences(session);

    const categories = await prisma.category.findMany();
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    return res.status(201).json({
      success: true,
      message: "Live class created successfully",
      data: formatSession(session, categoryMap, req),
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
    const sessions = await prisma.liveSession.findMany({
      where: { trainerId: parseInt(req.user.id) },
      include: { trainer: true },
      orderBy: { createdAt: "desc" },
    });

    const categories = await prisma.category.findMany();
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    return res.status(200).json({
      success: true,
      message: "Trainer sessions fetched successfully",
      data: sessions.map(s => formatSession(s, categoryMap, req)),
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

    const categories = await prisma.category.findMany();
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    return res.status(200).json({
      success: true,
      message: "Trainer session fetched successfully",
      data: formatSession(session, categoryMap, req),
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
      courseId,
      courseTitle,
      category,
      title,
      subtitle,
      description,
      startTime,
      endTime,
      timezone,
      meetingLink,
      recurrenceType,
    } = req.body;

    const isRecurring = req.body.isRecurring !== undefined 
      ? (req.body.isRecurring === true || req.body.isRecurring === "true")
      : undefined;

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (subtitle !== undefined) updateData.subtitle = subtitle;
    if (description !== undefined) updateData.description = description;
    if (startTime !== undefined) updateData.startTime = startTime;
    if (endTime !== undefined) updateData.endTime = endTime;
    if (timezone !== undefined) updateData.timezone = timezone;
    if (meetingLink !== undefined) updateData.meetingLink = meetingLink;
    if (isRecurring !== undefined) updateData.isRecurring = isRecurring;
    if (recurrenceType !== undefined) updateData.recurrenceType = recurrenceType;

    if (updateData.isRecurring === false) {
      updateData.recurrenceType = null;
    }

    if (req.body.enableWhatsApp !== undefined) {
      updateData.enableWhatsApp = req.body.enableWhatsApp === true || req.body.enableWhatsApp === "true";
    }
    if (req.body.whatsappTemplateName !== undefined) {
      updateData.whatsappTemplateName = req.body.whatsappTemplateName || null;
    }
    if (req.body.whatsappCustomTitle !== undefined) {
      updateData.whatsappCustomTitle = req.body.whatsappCustomTitle || null;
    }
    if (req.body.whatsappButtonUrl !== undefined) {
      updateData.whatsappButtonUrl = req.body.whatsappButtonUrl || null;
    }
    if (req.body.trainerInstructions !== undefined) {
      updateData.trainerInstructions = req.body.trainerInstructions || null;
    }
    if (req.body.recurringDays !== undefined) {
      let parsed = null;
      if (req.body.recurringDays) {
        if (typeof req.body.recurringDays === "string") {
          try {
            parsed = JSON.parse(req.body.recurringDays);
          } catch (e) {
            parsed = req.body.recurringDays;
          }
        } else {
          parsed = req.body.recurringDays;
        }
      }
      updateData.recurringDays = parsed;
    }

    if (req.file) {
      updateData.thumbnail = req.file.path;
    } else if (req.body.thumbnail !== undefined) {
      updateData.thumbnail = (req.body.thumbnail === "null" || req.body.thumbnail === "undefined") 
        ? null 
        : req.body.thumbnail;
    }

    if (courseId !== undefined || courseTitle !== undefined || category !== undefined) {
      let resolvedCourseId = courseId !== undefined ? courseId : existing.courseId;
      let resolvedCourseTitle = courseTitle !== undefined ? courseTitle : existing.courseTitle;
      let resolvedCategory = category !== undefined ? category : existing.category;

      if (courseId) {
        const categoryRecord = await prisma.category.findUnique({
          where: { id: courseId }
        });
        if (categoryRecord) {
          resolvedCourseId = categoryRecord.id;
          resolvedCourseTitle = categoryRecord.name;
          resolvedCategory = categoryRecord.description || "Frontend Development";
        }
      } else if (resolvedCourseTitle && !resolvedCourseId) {
        const existingCategory = await prisma.category.findFirst({
          where: { name: { equals: resolvedCourseTitle, mode: 'insensitive' } }
        });
        if (existingCategory) {
          resolvedCourseId = existingCategory.id;
        }
      }

      updateData.courseId = resolvedCourseId;
      updateData.courseTitle = resolvedCourseTitle;
      updateData.category = resolvedCategory;
    }

    // Recalculate timing fields
    const checkDate = req.body.scheduledDate || req.body.date || existing.scheduledDate || (existing.createdAt ? getKolkataDateString(new Date(existing.createdAt)) : getKolkataDateString());
    const checkStartTime = startTime !== undefined ? startTime : existing.startTime;
    const checkEndTime = endTime !== undefined ? endTime : existing.endTime;

    const formatTime = (t) => {
      if (!t) return t;
      const normalized = t.replace(".", ":");
      if (normalized.includes("AM") || normalized.includes("PM")) {
        let [timePart, modifier] = normalized.split(" ");
        let [hours, minutes] = timePart.split(":").map(Number);
        if (modifier === "PM" && hours < 12) hours += 12;
        if (modifier === "AM" && hours === 12) hours = 0;
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
      }
      return normalized;
    };

    const finalStartTime = checkStartTime ? formatTime(checkStartTime) : null;
    const finalEndTime = checkEndTime ? formatTime(checkEndTime) : null;

    const calculateDurationMinutes = (start, end) => {
      if (!start || !end) return 60;
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)) return 60;
      let diff = (eh * 60 + em) - (sh * 60 + sm);
      if (diff < 0) diff += 24 * 60;
      return diff;
    };

    const finalDurationMinutes = calculateDurationMinutes(finalStartTime, finalEndTime);

    updateData.startTime = finalStartTime;
    updateData.endTime = finalEndTime;
    updateData.scheduledDate = checkDate;
    updateData.durationMinutes = finalDurationMinutes;
    updateData.scheduledAt = finalStartTime ? `${checkDate} ${finalStartTime}` : null;
    updateData.endsAt = finalEndTime ? `${checkDate} ${finalEndTime}` : null;

    // Fetch old occurrences for logging
    const oldOccurrences = await prisma.sessionOccurrence.findMany({
      where: { sessionId },
      select: { id: true }
    });
    const oldJobIds = oldOccurrences.map(o => o.id);
    const oldScheduledAt = existing.scheduledAt;

    // Cancel/delete/mark inactive any existing pending WhatsApp reminder jobs for that session.
    await prisma.sessionOccurrence.deleteMany({
      where: { sessionId }
    });

    await prisma.whatsAppReminder.deleteMany({
      where: { sessionId }
    });

    await prisma.booking.updateMany({
      where: { sessionId },
      data: {
        whatsappReminderSentAt: null,
        whatsappReminderStatus: null,
        whatsappReminderMessageId: null,
        whatsappReminderError: null
      }
    });

    const updated = await prisma.liveSession.update({
      where: { id: sessionId },
      data: updateData,
      include: { trainer: true },
    });

    // Create a new WhatsApp reminder job based on the updated scheduledAt time.
    await generateOccurrences(updated);

    // Fetch new occurrences for logging
    const newOccurrences = await prisma.sessionOccurrence.findMany({
      where: { sessionId },
      select: { id: true }
    });
    const newJobIds = newOccurrences.map(o => o.id);

    // Add logs for sessionId, old scheduledAt, new scheduledAt, old WhatsApp job id, new WhatsApp job id.
    console.log("[WHATSAPP-RESCHEDULE] Session timing updated", {
      sessionId,
      oldScheduledAt,
      newScheduledAt: updated.scheduledAt,
      oldWhatsappJobId: oldJobIds.join(", "),
      newWhatsappJobId: newJobIds.join(", ")
    });

    const categories = await prisma.category.findMany();
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    return res.status(200).json({
      success: true,
      message: "Live class updated successfully",
      data: formatSession(updated, categoryMap, req),
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

// ─────────────────────────────────────────────
// @desc    Pause a session
// @route   POST /api/trainer/sessions/:sessionId/pause
// @access  Private/Trainer
// ─────────────────────────────────────────────
const pauseSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const existing = await prisma.liveSession.findUnique({ where: { id: sessionId } });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Session not found." });
    }

    const updated = await prisma.liveSession.update({
      where: { id: sessionId },
      data: { status: "paused" },
      include: { trainer: true }
    });

    const categories = await prisma.category.findMany();
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    return res.status(200).json({
      success: true,
      message: "Session paused successfully.",
      data: formatSession(updated, categoryMap, req)
    });
  } catch (error) {
    console.error("pauseSession Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// @desc    Resume a session
// @route   POST /api/trainer/sessions/:sessionId/resume
// @access  Private/Trainer
// ─────────────────────────────────────────────
const resumeSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const existing = await prisma.liveSession.findUnique({ where: { id: sessionId } });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Session not found." });
    }

    const updated = await prisma.liveSession.update({
      where: { id: sessionId },
      data: { status: "active" },
      include: { trainer: true }
    });

    const categories = await prisma.category.findMany();
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    return res.status(200).json({
      success: true,
      message: "Session resumed successfully.",
      data: formatSession(updated, categoryMap, req)
    });
  } catch (error) {
    console.error("resumeSession Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// @desc    End a session
// @route   POST /api/trainer/sessions/:sessionId/end
// @access  Private/Trainer
// ─────────────────────────────────────────────
const endSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const existing = await prisma.liveSession.findUnique({ where: { id: sessionId } });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Session not found." });
    }

    const [updated] = await prisma.$transaction([
      prisma.liveSession.update({
        where: { id: sessionId },
        data: { status: "ended", endedAt: new Date() },
        include: { trainer: true }
      }),
      prisma.trainerEarning.updateMany({
        where: {
          sessionId,
          status: "pending_session_completion"
        },
        data: {
          status: "payable"
        }
      })
    ]);

    const categories = await prisma.category.findMany();
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    return res.status(200).json({
      success: true,
      message: "Session ended successfully.",
      data: formatSession(updated, categoryMap, req)
    });
  } catch (error) {
    console.error("endSession Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// @desc    Cancel session for today
// @route   POST /api/trainer/sessions/:sessionId/cancel-today
// @access  Private/Trainer
// ─────────────────────────────────────────────
const cancelTodaySession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const existing = await prisma.liveSession.findUnique({ where: { id: sessionId } });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Session not found." });
    }

    const todayStr = getKolkataDateString();
    let cancelledDates = [];
    if (existing.cancelledDates) {
      if (Array.isArray(existing.cancelledDates)) {
        cancelledDates = existing.cancelledDates;
      } else {
        try {
          cancelledDates = typeof existing.cancelledDates === 'string'
            ? JSON.parse(existing.cancelledDates)
            : existing.cancelledDates;
        } catch (e) {
          cancelledDates = [];
        }
      }
    }

    if (!cancelledDates.includes(todayStr)) {
      cancelledDates.push(todayStr);
    }

    const updated = await prisma.liveSession.update({
      where: { id: sessionId },
      data: { cancelledDates },
      include: { trainer: true }
    });

    const categories = await prisma.category.findMany();
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    return res.status(200).json({
      success: true,
      message: "Session cancelled for today successfully.",
      data: formatSession(updated, categoryMap, req)
    });
  } catch (error) {
    console.error("cancelTodaySession Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// @desc    Un-cancel session for today
// @route   DELETE /api/trainer/sessions/:sessionId/cancel-today
// @access  Private/Trainer
// ─────────────────────────────────────────────
const uncancelTodaySession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const existing = await prisma.liveSession.findUnique({ where: { id: sessionId } });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Session not found." });
    }

    const todayStr = getKolkataDateString();
    let cancelledDates = [];
    if (existing.cancelledDates) {
      if (Array.isArray(existing.cancelledDates)) {
        cancelledDates = existing.cancelledDates;
      } else {
        try {
          cancelledDates = typeof existing.cancelledDates === 'string'
            ? JSON.parse(existing.cancelledDates)
            : existing.cancelledDates;
        } catch (e) {
          cancelledDates = [];
        }
      }
    }

    cancelledDates = cancelledDates.filter(d => d !== todayStr);

    const updated = await prisma.liveSession.update({
      where: { id: sessionId },
      data: { cancelledDates },
      include: { trainer: true }
    });

    const categories = await prisma.category.findMany();
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    return res.status(200).json({
      success: true,
      message: "Session uncancelled for today successfully.",
      data: formatSession(updated, categoryMap, req)
    });
  } catch (error) {
    console.error("uncancelTodaySession Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

const endCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const category = await prisma.category.findUnique({ where: { id: courseId } });
    if (!category) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    await prisma.$transaction([
      prisma.category.update({
        where: { id: courseId },
        data: { status: "ended" }
      }),
      prisma.booking.updateMany({
        where: { courseId, accessScope: "course", status: "paid" },
        data: { status: "completed" }
      }),
      prisma.liveSession.updateMany({
        where: { courseId, status: "active" },
        data: { status: "ended", endedAt: new Date() }
      })
    ]);

    return res.status(200).json({
      success: true,
      message: "Course ended successfully. Student access marked inactive."
    });
  } catch (error) {
    console.error("endCourse Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

const completeCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const category = await prisma.category.findUnique({ where: { id: courseId } });
    if (!category) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    await prisma.$transaction([
      prisma.category.update({
        where: { id: courseId },
        data: { status: "completed" }
      }),
      prisma.booking.updateMany({
        where: { courseId, accessScope: "course", status: "paid" },
        data: { status: "completed" }
      }),
      prisma.liveSession.updateMany({
        where: { courseId, status: "active" },
        data: { status: "ended", endedAt: new Date() }
      })
    ]);

    return res.status(200).json({
      success: true,
      message: "Course completed successfully. Student access marked inactive."
    });
  } catch (error) {
    console.error("completeCourse Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

const cancelCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const category = await prisma.category.findUnique({ where: { id: courseId } });
    if (!category) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    await prisma.$transaction([
      prisma.category.update({
        where: { id: courseId },
        data: { status: "cancelled" }
      }),
      prisma.booking.updateMany({
        where: { courseId, accessScope: "course", status: "paid" },
        data: { status: "cancelled" }
      }),
      prisma.liveSession.updateMany({
        where: { courseId, status: "active" },
        data: { status: "cancelled" }
      })
    ]);

    return res.status(200).json({
      success: true,
      message: "Course cancelled successfully. Student access marked inactive."
    });
  } catch (error) {
    console.error("cancelCourse Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

module.exports = {
  getTrainerStatus,
  getTrainerCourses,
  createSession,
  getTrainerSessions,
  getSingleTrainerSession,
  updateTrainerSession,
  deleteTrainerSession,
  pauseSession,
  resumeSession,
  endSession,
  cancelTodaySession,
  uncancelTodaySession,
  endCourse,
  completeCourse,
  cancelCourse,
  // Mappings for legacy routing
  publishSession: resumeSession,
  cancelSession: cancelTodaySession
};
