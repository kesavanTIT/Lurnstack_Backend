const { Prisma } = require("@prisma/client");
const prisma = require("../config/db");
const { sendWhatsAppReminder, sendSessionReminderWhatsApp } = require("../services/whatsappService");
const { generateOccurrences } = require("../services/occurrenceService");

const dashboardUserSelect = {
  id: true,
  fullName: true,
  email: true,
  phoneNumber: true,
  createdAt: true,
  isActive: true,
  profilePhotoUrl: true,
};

const hasUserField = (fieldName) => {
  const userModel = Prisma.dmmf.datamodel.models.find((model) => model.name === "User");
  return Boolean(userModel?.fields.some((field) => field.name === fieldName));
};

const parseUserId = (rawId) => {
  const id = Number.parseInt(rawId, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const parseClassId = (rawId) => {
  const id = Number.parseInt(rawId, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
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

// Helper: validate recurringDays format and values
const validateRecurringDays = (recurringDays) => {
  if (recurringDays === undefined || recurringDays === null) {
    return { isValid: true, parsed: null };
  }
  let parsed = recurringDays;
  if (typeof recurringDays === "string") {
    try {
      parsed = JSON.parse(recurringDays);
    } catch (e) {
      return { isValid: false, message: "recurringDays must be a valid JSON array of integers ranging between 0 (Sunday) and 6 (Saturday)." };
    }
  }
  if (!Array.isArray(parsed)) {
    return { isValid: false, message: "recurringDays must be a valid JSON array of integers ranging between 0 (Sunday) and 6 (Saturday)." };
  }
  for (const day of parsed) {
    const num = Number(day);
    if (!Number.isInteger(num) || num < 0 || num > 6) {
      return { isValid: false, message: "Each value in recurringDays must be an integer ranging between 0 (Sunday) and 6 (Saturday)." };
    }
  }
  return { isValid: true, parsed: parsed.map(Number) };
};

// Helper: validate recurrenceEndDate format (YYYY-MM-DD)
const validateRecurrenceEndDate = (recurrenceEndDate) => {
  if (recurrenceEndDate === undefined || recurrenceEndDate === null || recurrenceEndDate === "") {
    return { isValid: true, parsed: null };
  }
  const dateStr = String(recurrenceEndDate).trim();
  const match = dateStr.match(/^\d{4}-\d{2}-\d{2}$/);
  if (!match) {
    return { isValid: false, message: "recurrenceEndDate must be in YYYY-MM-DD format." };
  }
  const parsedDate = new Date(dateStr);
  if (isNaN(parsedDate.getTime())) {
    return { isValid: false, message: "recurrenceEndDate is not a valid calendar date." };
  }
  return { isValid: true, parsed: dateStr };
};


// @desc    Get admin dashboard student/trainer counts
// @route   GET /api/admin/dashboard/summary
// @access  Private/Admin
const getDashboardSummary = async (req, res) => {
  try {
    const [totalStudents, totalTrainers] = await Promise.all([
      prisma.user.count({ where: { role: "STUDENT" } }),
      prisma.user.count({ where: { role: "TRAINER" } }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalStudents,
        totalTrainers,
      },
    });
  } catch (error) {
    console.error("Dashboard Summary Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to fetch dashboard summary.",
    });
  }
};

// @desc    Get all students for admin dashboard
// @route   GET /api/admin/students
// @access  Private/Admin
const getStudents = async (req, res) => {
  try {
    const students = await prisma.user.findMany({
      where: { role: "STUDENT" },
      select: dashboardUserSelect,
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      success: true,
      data: students,
    });
  } catch (error) {
    console.error("Get Students Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to fetch students.",
    });
  }
};

// @desc    Get all trainers for admin dashboard
// @route   GET /api/admin/trainers
// @access  Private/Admin
const getTrainers = async (req, res) => {
  try {
    const trainers = await prisma.user.findMany({
      where: { role: "TRAINER" },
      select: dashboardUserSelect,
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      success: true,
      data: trainers,
    });
  } catch (error) {
    console.error("Get Trainers Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to fetch trainers.",
    });
  }
};

// @desc    Delete a student
// @route   DELETE /api/admin/students/:id
// @access  Private/Admin
const deleteStudent = async (req, res) => {
  try {
    const id = parseUserId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Invalid student ID.",
      });
    }

    const result = await prisma.user.deleteMany({
      where: {
        id,
        role: "STUDENT",
      },
    });

    if (result.count === 0) {
      return res.status(404).json({
        success: false,
        message: "Student not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Student deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Student Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to delete student.",
    });
  }
};

// @desc    Delete all students
// @route   DELETE /api/admin/students
// @access  Private/Admin
const deleteAllStudents = async (req, res) => {
  try {
    const result = await prisma.user.deleteMany({
      where: {
        role: "STUDENT",
      },
    });

    return res.status(200).json({
      success: true,
      message: `All students deleted successfully. Total deleted: ${result.count}`,
      count: result.count,
    });
  } catch (error) {
    console.error("Delete All Students Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to delete all students.",
    });
  }
};

// @desc    Delete a trainer and their dependent live sessions
// @route   DELETE /api/admin/trainers/:id
// @access  Private/Admin
const deleteTrainer = async (req, res) => {
  try {
    const id = parseUserId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Invalid trainer ID.",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const trainer = await tx.user.findFirst({
        where: {
          id,
          role: "TRAINER",
        },
        select: {
          id: true,
        },
      });

      if (!trainer) {
        return { deleted: false };
      }

      const trainerSessions = await tx.liveSession.findMany({
        where: {
          trainerId: id,
        },
        select: {
          id: true,
        },
      });

      const trainerSessionIds = trainerSessions.map((session) => session.id);

      if (trainerSessionIds.length > 0) {
        await tx.sessionBooking.deleteMany({
          where: {
            sessionId: {
              in: trainerSessionIds,
            },
          },
        });

        await tx.sessionCard.deleteMany({
          where: {
            sessionId: {
              in: trainerSessionIds,
            },
          },
        });
      }

      await tx.liveSession.deleteMany({
        where: {
          trainerId: id,
        },
      });

      const deletedTrainer = await tx.user.deleteMany({
        where: {
          id,
          role: "TRAINER",
        },
      });

      return { deleted: deletedTrainer.count > 0 };
    });

    if (!result.deleted) {
      return res.status(404).json({
        success: false,
        message: "Trainer not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Trainer deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Trainer Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to delete trainer.",
    });
  }
};

// @desc    Toggle trainer active status
// @route   PATCH /api/admin/trainers/:id/status
// @access  Private/Admin
const toggleTrainerStatus = async (req, res) => {
  try {
    const id = parseUserId(req.params.id);
    const status = req.body.status ?? req.body.isActive;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Invalid trainer ID.",
      });
    }

    if (typeof status !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Trainer status must be a boolean.",
      });
    }

    if (!hasUserField("isActive")) {
      return res.status(400).json({
        success: false,
        message: "Trainer status field is not configured in the User model.",
      });
    }

    const result = await prisma.user.updateMany({
      where: {
        id,
        role: "TRAINER",
      },
      data: {
        isActive: status,
      },
    });

    if (result.count === 0) {
      return res.status(404).json({
        success: false,
        message: "Trainer not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Trainer status updated successfully.",
      isActive: status,
    });
  } catch (error) {
    console.error("Toggle Trainer Status Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to update trainer status.",
    });
  }
};

const parseScheduledAt = (dateStr, timeStr) => {
  try {
    const normalizedTime = timeStr.replace(".", ":");
    const [year, month, day] = dateStr.split("-").map(Number);
    let [time, modifier] = normalizedTime.split(" ");
    let [hours, minutes] = time.split(":").map(Number);

    if (modifier === "PM" && hours < 12) hours += 12;
    if (modifier === "AM" && hours === 12) hours = 0;

    const isoStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00+05:30`;
    const date = new Date(isoStr);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch (error) {
    return null;
  }
};

const parseDurationMinutes = (durationStr) => {
  if (!durationStr) return 60;
  if (!Number.isNaN(Number(durationStr))) return Number.parseInt(durationStr, 10);

  const parts = durationStr.toString().toLowerCase().split(" ");
  const val = Number.parseInt(parts[0], 10);

  if (parts.includes("hour") || parts.includes("hours")) {
    return val * 60;
  }

  return val || 60;
};

const getKolkataDateString = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
};

const addMinutesToTime = (timeStr, minutes) => {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return timeStr;
  const totalMinutes = h * 60 + m + minutes;
  const newH = Math.floor(totalMinutes / 60) % 24;
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
};

const normalizeTimeToHHMM = (timeStr) => {
  if (!timeStr) return "12:00";
  const normalized = timeStr.replace(".", ":").trim();
  let timePart = normalized;
  let modifier = "";
  if (normalized.toUpperCase().includes("AM") || normalized.toUpperCase().includes("PM")) {
    const parts = normalized.split(/\s+/);
    timePart = parts[0];
    modifier = parts[1] ? parts[1].toUpperCase() : "";
    if (!modifier && (normalized.toUpperCase().endsWith("AM") || normalized.toUpperCase().endsWith("PM"))) {
      const match = normalized.match(/^([\d:]+)\s*(AM|PM)$/i);
      if (match) {
        timePart = match[1];
        modifier = match[2].toUpperCase();
      }
    }
  }
  let [hours, minutes] = timePart.split(":").map(Number);
  if (Number.isNaN(hours)) hours = 12;
  if (Number.isNaN(minutes)) minutes = 0;
  if (modifier === "PM" && hours < 12) hours += 12;
  if (modifier === "AM" && hours === 12) hours = 0;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

// @desc    Create a new live class
// @route   POST /api/admin/create-live-class
// @access  Private/Admin
const createLiveClass = async (req, res) => {
  try {
    const recDays = req.body.recurringDays !== undefined ? req.body.recurringDays : req.body.recurring_days;
    const validation = validateRecurringDays(recDays);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.message,
      });
    }

    const dateValidation = validateRecurrenceEndDate(req.body.recurrenceEndDate);
    if (!dateValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: dateValidation.message,
      });
    }


    const {
      courseId,
      course_id,
      courseName,
      title,
      classTitle,
      instructor,
      trainerName,
      description,
      date,
      startTime,
      endTime,
      endsAt,
      end_time,
      time,
      duration,
      meetingLink,
      meetLink,
      sectionType,
      source,
    } = req.body;

    const resolvedInstructor = instructor || trainerName;
    const resolvedCourseId = courseId || course_id || null;
    const resolvedEndTimeInput = endTime || endsAt || end_time;

    const thumbnail = req.file ? req.file.path : null;

    if (!courseName || (!classTitle && !title) || !resolvedInstructor || !date || (!time && !startTime) || !duration || (!meetLink && !meetingLink)) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields.",
      });
    }

    const checkTime = time || startTime;
    const scheduledAt = parseScheduledAt(date, checkTime);
    const durationMinutes = parseDurationMinutes(duration);

    const isTIT = sectionType === "TIT" || source === "admin_tit_classes";
    
    // Always resolve trainerId from instructor name for LiveSession mapping
    let trainerId = null;
    if (resolvedInstructor) {
      const matchedTrainer = await prisma.user.findFirst({
        where: {
          role: "TRAINER",
          fullName: { contains: resolvedInstructor, mode: "insensitive" }
        }
      });
      if (matchedTrainer) {
        trainerId = matchedTrainer.id;
      }
    }
    if (!trainerId) {
      return res.status(400).json({
        success: false,
        message: `Trainer '${resolvedInstructor}' not found. Please ensure the trainer exists.`
      });
    }

    // Parse and normalize time and date
    const formattedTime = normalizeTimeToHHMM(checkTime);
    const scheduledDate = date; // e.g. "2026-06-11"
    const scheduledAtStr = `${scheduledDate} ${formattedTime}`;
    const calculatedEndTime = addMinutesToTime(formattedTime, durationMinutes);
    const finalEndTime = resolvedEndTimeInput || calculatedEndTime;
    const endsAtStr = finalEndTime ? `${scheduledDate} ${finalEndTime}` : null;

    // Try to find a matching category by courseName if courseId is not explicitly passed
    let finalCourseId = resolvedCourseId;
    if (!finalCourseId && courseName) {
      const existingCategory = await prisma.category.findFirst({
        where: { name: { equals: courseName, mode: 'insensitive' } }
      });
      if (existingCategory) {
        finalCourseId = existingCategory.id;
      }
    }

    const isRecurring = req.body.isRecurring === true || req.body.isRecurring === "true" || req.body.isRecurring === "1" || req.body.isRecurring === 1;
    const recurrenceType = isRecurring ? req.body.recurrenceType : null;

    const parsedRecurringDays = validation.parsed;

    // Create LiveSession (both for TIT and standard course sessions)
    const newSession = await prisma.liveSession.create({
      data: {
        courseId: finalCourseId,
        courseTitle: courseName,
        category: courseName,
        trainerId,
        title: title || classTitle,
        classTitle: classTitle || title,
        description: description || null,
        startTime: formattedTime,
        endTime: finalEndTime || null,
        timezone: "Asia/Kolkata",
        meetingLink: meetingLink || meetLink,
        isRecurring,
        recurrenceType,
        status: "active",
        cancelledDates: [],
        thumbnail,
        pricingState: isTIT ? "PENDING_PRICE" : "FREE",
        publishState: isTIT ? "DRAFT" : "PUBLISHED",
        sectionType: isTIT ? "TIT" : null,
        sessionType: isTIT ? "TIT" : null,
        source: isTIT ? "admin_tit_classes" : "admin_course_classes",
        createdByRole: "admin",
        requiresAdminReview: isTIT,
        scheduledDate,
        scheduledAt: scheduledAtStr,
        endsAt: endsAtStr,
        durationMinutes,
        enableWhatsApp: false, // Force false for admin scheduled classes
        trainerInstructions: req.body.trainerInstructions || null,
        recurringDays: parsedRecurringDays,
        recurrenceEndDate: dateValidation.parsed,
      },
    });

    // Automatically generate SessionOccurrence records so attendance system picks it up
    await generateOccurrences(newSession);

    let thumbnailResponse = newSession.thumbnail;
    if (thumbnailResponse && !thumbnailResponse.startsWith("http")) {
      thumbnailResponse = `${req.protocol}://${req.get("host")}/${thumbnailResponse.replace(/\\/g, "/")}`;
    }

    return res.status(201).json({
      success: true,
      message: "Live class created successfully!",
      data: {
        id: newSession.id,
        courseId: newSession.courseId,
        courseName: newSession.courseTitle || "",
        title: newSession.title || "",
        classTitle: newSession.classTitle || "",
        instructor: resolvedInstructor || "",
        description: newSession.description || "",
        date: newSession.scheduledDate || scheduledDate || "",
        startTime: newSession.startTime || "",
        endTime: newSession.endTime || "",
        time: newSession.startTime || "",
        duration: duration || "",
        meetLink: newSession.meetingLink || "",
        meetingLink: newSession.meetingLink || "",
        thumbnail: thumbnailResponse,
        isRecurring: newSession.isRecurring,
        recurrenceType: newSession.recurrenceType,
        recurringDays: serializeRecurringDays(newSession.recurringDays),
        recurrenceEndDate: newSession.recurrenceEndDate || null,
        publishState: newSession.publishState,
        pricingState: newSession.pricingState,
        requiresAdminReview: newSession.requiresAdminReview,
        sectionType: newSession.sectionType,
        sessionType: newSession.sessionType,
        source: newSession.source,
        createdByRole: newSession.createdByRole,
      },
    });
  } catch (error) {
    console.error("Create Live Class Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to create class.",
    });
  }
};

// @desc    Update an existing live class
// @route   PUT /api/admin/update-live-class/:classId
// @access  Private/Admin
const updateLiveClass = async (req, res) => {
  try {
    const recDaysUpdate = req.body.recurringDays !== undefined ? req.body.recurringDays : req.body.recurring_days;
    if (recDaysUpdate !== undefined) {
      const validation = validateRecurringDays(recDaysUpdate);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          message: validation.message,
        });
      }
    }

    if (req.body.recurrenceEndDate !== undefined) {
      const dateValidation = validateRecurrenceEndDate(req.body.recurrenceEndDate);
      if (!dateValidation.isValid) {
        return res.status(400).json({
          success: false,
          message: dateValidation.message,
        });
      }
    }


    const rawId = req.params.classId;
    const classIdInt = Number.parseInt(rawId, 10);
    const isNumericId = !Number.isNaN(classIdInt) && String(classIdInt) === String(rawId);

    const {
      courseId,
      course_id,
      courseName,
      title,
      classTitle,
      instructor,
      trainerName,
      description,
      date,
      time,
      startTime,
      duration,
      endTime,
      endsAt,
      end_time,
      meetLink,
      meetingLink,
      sectionType,
      source,
    } = req.body;

    const resolvedInstructor = instructor || trainerName;
    const resolvedCourseId = courseId || course_id;
    const resolvedEndTimeInput = endTime || endsAt || end_time;

    if (isNumericId) {
      const existingClass = await prisma.liveClass.findUnique({
        where: { id: classIdInt },
      });

      if (!existingClass) {
        return res.status(404).json({
          success: false,
          message: "Live class not found.",
        });
      }

      const newDate = date || existingClass.date;
      const newTime = time || existingClass.time;
      const scheduledAt = parseScheduledAt(newDate, newTime);
      const durationMinutes = parseDurationMinutes(duration || existingClass.duration);

      const updatedClass = await prisma.liveClass.update({
        where: { id: classIdInt },
        data: {
          courseName: courseName || existingClass.courseName,
          classTitle: classTitle || title || existingClass.classTitle,
          instructor: resolvedInstructor || existingClass.instructor,
          description: description !== undefined ? description : existingClass.description,
          date: newDate,
          time: newTime,
          duration: duration || existingClass.duration,
          scheduledAt,
          durationMinutes,
          meetLink: meetLink || existingClass.meetLink,
          thumbnail: req.file ? req.file.path : existingClass.thumbnail,
          sectionType: sectionType !== undefined ? sectionType : existingClass.sectionType,
          source: source !== undefined ? source : existingClass.source,
        },
      });

      if (updatedClass.thumbnail) {
        updatedClass.thumbnail = `${req.protocol}://${req.get("host")}/${updatedClass.thumbnail.replace(/\\/g, "/")}`;
      }

      return res.status(200).json({
        success: true,
        message: "Live class updated successfully!",
        data: updatedClass,
      });
    } else {
      // String ID -> LiveSession
      const existingSession = await prisma.liveSession.findUnique({
        where: { id: rawId },
      });

      if (!existingSession) {
        return res.status(404).json({
          success: false,
          message: "Live session not found.",
        });
      }

      const durationMinutes = parseDurationMinutes(duration || existingSession.durationMinutes || "60");

      const updateData = {};
      if (classTitle !== undefined || title !== undefined) {
        updateData.title = classTitle || title;
        updateData.classTitle = classTitle || title; // legacy column
      }
      if (description !== undefined) {
        updateData.description = description;
      }
      if (meetLink !== undefined || meetingLink !== undefined) {
        updateData.meetingLink = meetLink || meetingLink;
      }
      if (courseName !== undefined) {
        updateData.courseTitle = courseName; // legacy column
      }
      if (resolvedCourseId !== undefined) {
        updateData.courseId = resolvedCourseId;
      }

      if (sectionType !== undefined) {
        const isTITUpdate = sectionType === "TIT";
        updateData.sectionType = isTITUpdate ? "TIT" : null;
        updateData.sessionType = isTITUpdate ? "TIT" : null;
        updateData.source = isTITUpdate ? "admin_tit_classes" : "admin_course_classes";
        updateData.requiresAdminReview = isTITUpdate;
        if (!isTITUpdate) {
          updateData.pricingState = "FREE";
          updateData.publishState = "PUBLISHED";
        }
      }

      if (resolvedInstructor !== undefined) {
        const matchedTrainer = await prisma.user.findFirst({
          where: {
            role: "TRAINER",
            fullName: { contains: resolvedInstructor, mode: "insensitive" }
          }
        });
        if (matchedTrainer) {
          updateData.trainerId = matchedTrainer.id;
        } else if (resolvedInstructor.trim() !== "") {
          return res.status(400).json({
            success: false,
            message: `Trainer '${resolvedInstructor}' not found. Please ensure the trainer exists.`
          });
        }
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
      if (recDaysUpdate !== undefined) {
        const validation = validateRecurringDays(recDaysUpdate);
        updateData.recurringDays = validation.parsed;
      }
      if (req.body.recurrenceEndDate !== undefined) {
        const dateValidation = validateRecurrenceEndDate(req.body.recurrenceEndDate);
        updateData.recurrenceEndDate = dateValidation.parsed;
      }

      if (req.file) {
        updateData.thumbnail = req.file.path;
      }

      if (time !== undefined || date !== undefined || duration !== undefined) {
        const checkDate = date || (existingSession.createdAt ? getKolkataDateString(new Date(existingSession.createdAt)) : getKolkataDateString());
        const checkTime = time || existingSession.startTime || "12:00";
        
        let formattedTime = checkTime;
        const normalized = checkTime.replace(".", ":");
        if (normalized.includes("AM") || normalized.includes("PM")) {
          let [t, modifier] = normalized.split(" ");
          let [hours, minutes] = t.split(":").map(Number);
          if (modifier === "PM" && hours < 12) hours += 12;
          if (modifier === "AM" && hours === 12) hours = 0;
          formattedTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
        }
        
        updateData.startTime = formattedTime;
        updateData.durationMinutes = durationMinutes;
        
        const newEndTime = resolvedEndTimeInput || addMinutesToTime(formattedTime, durationMinutes);
        if (newEndTime) {
          updateData.endTime = newEndTime;
        }

        updateData.scheduledDate = checkDate;
        updateData.scheduledAt = `${checkDate} ${formattedTime}`;
        updateData.endsAt = newEndTime ? `${checkDate} ${newEndTime}` : undefined;
      }

      // Cleanup existing pending reminder occurrences/jobs
      // Only delete future/upcoming occurrences to preserve past occurrences and attendance history.
      await prisma.sessionOccurrence.deleteMany({
        where: {
          sessionId: rawId,
          endsAt: { gte: new Date() }
        }
      });

      await prisma.whatsAppReminder.deleteMany({
        where: { sessionId: rawId }
      });

      await prisma.booking.updateMany({
        where: { sessionId: rawId },
        data: {
          whatsappReminderSentAt: null,
          whatsappReminderStatus: null,
          whatsappReminderMessageId: null,
          whatsappReminderError: null
        }
      });

      const updatedSession = await prisma.liveSession.update({
        where: { id: rawId },
        data: updateData,
        include: { trainer: true },
      });

      // Automatically generate SessionOccurrence records based on the updated settings
      await generateOccurrences(updatedSession);

      const responseData = {
        id: updatedSession.id,
        courseName: updatedSession.courseTitle || "Live Session",
        classTitle: updatedSession.title,
        instructor: updatedSession.trainer?.fullName || "Trainer",
        description: updatedSession.description || "",
        date: updatedSession.scheduledDate || "",
        time: updatedSession.startTime || "",
        duration: `${updatedSession.durationMinutes || 60} mins`,
        meetLink: updatedSession.meetingLink || "",
        thumbnail: updatedSession.thumbnail ? `${req.protocol}://${req.get("host")}/${updatedSession.thumbnail.replace(/\\/g, "/")}` : null,
        isRecurring: updatedSession.isRecurring,
        recurrenceType: updatedSession.recurrenceType,
        recurringDays: serializeRecurringDays(updatedSession.recurringDays),
        recurrenceEndDate: updatedSession.recurrenceEndDate || null,
      };

      return res.status(200).json({

        success: true,
        message: "Live session updated successfully!",
        data: responseData,
      });
    }
  } catch (error) {
    console.error("Update Live Class/Session Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to update class/session.",
    });
  }
};

// @desc    Delete a live class
// @route   DELETE /api/admin/delete-live-class/:classId
// @access  Private/Admin
const deleteLiveClass = async (req, res) => {
  try {
    const rawId = req.params.classId;
    const classIdInt = Number.parseInt(rawId, 10);
    const isNumericId = !Number.isNaN(classIdInt) && String(classIdInt) === String(rawId);

    if (isNumericId) {
      const existingClass = await prisma.liveClass.findUnique({
        where: { id: classIdInt },
      });

      if (!existingClass) {
        return res.status(404).json({
          success: false,
          message: "Live class not found.",
        });
      }

      await prisma.liveClass.delete({
        where: { id: classIdInt },
      });

      return res.status(200).json({
        success: true,
        message: "Live class deleted successfully!",
      });
    } else {
      // String ID -> LiveSession
      const existingSession = await prisma.liveSession.findUnique({
        where: { id: rawId },
      });

      if (!existingSession) {
        return res.status(404).json({
          success: false,
          message: "Live session not found.",
        });
      }

      await prisma.liveSession.update({
        where: { id: rawId },
        data: { status: "deleted" },
      });

      // Delete occurrences and pending WhatsApp reminders for the deleted session
      await prisma.sessionOccurrence.deleteMany({
        where: { sessionId: rawId }
      });

      await prisma.whatsAppReminder.deleteMany({
        where: { sessionId: rawId }
      });

      await prisma.booking.updateMany({
        where: { sessionId: rawId },
        data: {
          whatsappReminderSentAt: null,
          whatsappReminderStatus: null,
          whatsappReminderMessageId: null,
          whatsappReminderError: null
        }
      });

      return res.status(200).json({
        success: true,
        message: "Live session deleted successfully!",
      });
    }
  } catch (error) {
    console.error("Delete Live Class/Session Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to delete class/session.",
    });
  }
};

// @desc    Test WhatsApp session reminder template for a specific number/session
// @route   POST /api/admin/whatsapp/test-session-reminder
// @access  Private/Admin
const testSessionReminderWhatsapp = async (req, res) => {
  try {
    const { studentPhone, studentName, sessionTitle, minutesLeft, trainerName, sessionId, buttonUrl } = req.body;

    if (!studentPhone) {
      return res.status(400).json({
        success: false,
        message: "studentPhone is required.",
      });
    }

    const result = await sendSessionReminderWhatsApp({
      phone: studentPhone,
      studentPhone,
      studentName: studentName || "Test Student",
      sessionTitle: sessionTitle || "Test Live Session",
      minutesLeft: minutesLeft || 30,
      trainerName: trainerName || "Test Trainer",
      sessionId: sessionId || "test-session-id",
      buttonUrl,
    });

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: "Test WhatsApp message sent successfully.",
        data: result.rawResponse,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Failed to send test WhatsApp message.",
        error: result.error,
        data: result.rawResponse,
      });
    }
  } catch (error) {
    console.error("Test WhatsApp Session Reminder Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to send WhatsApp test message.",
      error: error.message,
    });
  }
};

// @desc    Manual test WhatsApp template for admin/dev only
// @route   POST /api/admin/test-whatsapp-reminder
// @access  Private/Admin
const testWhatsappReminderManual = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "phone is required.",
      });
    }

    const result = await sendWhatsAppReminder({
      phone,
    });

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: "WhatsApp reminder sent successfully.",
        data: result.rawResponse,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Failed to send WhatsApp reminder.",
        error: result.error,
        data: result.rawResponse,
      });
    }
  } catch (error) {
    console.error("Manual test WhatsApp reminder failed:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Get all session deletion requests
// @route   GET /api/admin/sessions/delete-requests
// @access  Private/Admin
// ─────────────────────────────────────────────
const getDeleteRequests = async (req, res) => {
  try {
    const requests = await prisma.liveSession.findMany({
      where: { deleteRequested: true },
      include: {
        trainer: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return res.status(200).json({ success: true, data: requests });
  } catch (error) {
    console.error("getDeleteRequests error:", error);
    return res.status(500).json({ success: false, message: "Server error fetching delete requests." });
  }
};

// ─────────────────────────────────────────────
// @desc    Approve a session deletion request
// @route   POST /api/admin/sessions/:sessionId/approve-delete
// @access  Private/Admin
// ─────────────────────────────────────────────
const approveDeleteRequest = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
    if (!session || !session.deleteRequested) {
      return res.status(404).json({ success: false, message: "Delete request not found or session doesn't exist." });
    }

    await prisma.liveSession.delete({ where: { id: sessionId } });
    return res.status(200).json({ success: true, message: "Session permanently deleted." });
  } catch (error) {
    console.error("approveDeleteRequest error:", error);
    return res.status(500).json({ success: false, message: "Server error approving delete request." });
  }
};

// ─────────────────────────────────────────────
// @desc    Reject a session deletion request
// @route   POST /api/admin/sessions/:sessionId/reject-delete
// @access  Private/Admin
// ─────────────────────────────────────────────
const rejectDeleteRequest = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { reason } = req.body;
    const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
    if (!session || !session.deleteRequested) {
      return res.status(404).json({ success: false, message: "Delete request not found or session doesn't exist." });
    }

    const updated = await prisma.liveSession.update({
      where: { id: sessionId },
      data: { 
        deleteRequested: false,
        deleteRejectReason: reason || null
      },
    });
    return res.status(200).json({ success: true, message: "Delete request rejected. Session remains active.", data: updated });
  } catch (error) {
    console.error("rejectDeleteRequest error:", error);
    return res.status(500).json({ success: false, message: "Server error rejecting delete request." });
  }
};

// @desc    Get all admin-created live classes
// @route   GET /api/admin/get-live-classes
// @access  Private/Admin
const getLiveClasses = async (req, res) => {
  try {
    const classes = await prisma.liveSession.findMany({
      where: {
        status: { not: "deleted" },
        sectionType: "TIT",
        source: "admin_tit_classes",
      },
      include: {
        trainer: { select: { fullName: true } }
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = classes.map((c) => {
      let thumbnail = c.thumbnail;
      if (thumbnail && !thumbnail.startsWith("http")) {
        thumbnail = `${req.protocol}://${req.get("host")}/${thumbnail.replace(/\\/g, "/")}`;
      }
      return {
        id: c.id,
        courseId: c.courseId,
        courseName: c.courseTitle || c.category || "Live Session",
        classTitle: c.title || c.classTitle || "",
        instructor: c.trainer?.fullName || "Trainer",
        description: c.description || "",
        date: c.scheduledDate || "",
        time: c.startTime || "",
        endTime: c.endTime || c.endsAt || "",
        duration: c.durationMinutes ? `${c.durationMinutes} mins` : "",
        meetLink: c.meetingLink || "",
        thumbnail: thumbnail,
        status: "Scheduled",
        sectionType: c.sectionType,
        source: c.source,
        isRecurring: c.isRecurring,
        recurrenceType: c.recurrenceType,
        recurringDays: serializeRecurringDays(c.recurringDays),
        recurrenceEndDate: c.recurrenceEndDate || null,
      };
    });

    return res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    console.error("Get Live Classes Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to fetch live classes.",
    });
  }
};

// @desc    Get a single admin-created live class by ID
// @route   GET /api/admin/live-classes/:classId
// @access  Private/Admin
const getLiveClass = async (req, res) => {
  try {
    const { classId } = req.params;
    
    const c = await prisma.liveSession.findUnique({
      where: { id: classId },
      include: {
        trainer: { select: { fullName: true } }
      }
    });

    if (!c) {
      const classIdInt = Number.parseInt(classId, 10);
      if (!Number.isNaN(classIdInt) && String(classIdInt) === String(classId)) {
        const legacyClass = await prisma.liveClass.findUnique({
          where: { id: classIdInt },
        });
        if (legacyClass) {
          let thumbnail = legacyClass.thumbnail;
          if (thumbnail && !thumbnail.startsWith("http")) {
            thumbnail = `${req.protocol}://${req.get("host")}/${thumbnail.replace(/\\/g, "/")}`;
          }
          return res.status(200).json({
            success: true,
            data: {
              ...legacyClass,
              courseId: legacyClass.courseName,
              duration: legacyClass.duration || (legacyClass.durationMinutes ? `${legacyClass.durationMinutes} mins` : ""),
              thumbnail,
            }
          });
        }
      }
      return res.status(404).json({ success: false, message: "Class not found." });
    }

    let thumbnail = c.thumbnail;
    if (thumbnail && !thumbnail.startsWith("http")) {
      thumbnail = `${req.protocol}://${req.get("host")}/${thumbnail.replace(/\\/g, "/")}`;
    }

    return res.status(200).json({
      success: true,
      data: {
        id: c.id,
        courseId: c.courseId,
        courseName: c.courseTitle || c.category || "Live Session",
        classTitle: c.title || c.classTitle || "",
        instructor: c.trainer?.fullName || "Trainer",
        description: c.description || "",
        date: c.scheduledDate || "",
        time: c.startTime || "",
        endTime: c.endTime || c.endsAt || "",
        duration: c.durationMinutes ? `${c.durationMinutes} mins` : "",
        meetLink: c.meetingLink || "",
        thumbnail: thumbnail,
        status: "Scheduled",
        sectionType: c.sectionType,
        source: c.source,
        isRecurring: c.isRecurring,
        recurrenceType: c.recurrenceType,
        recurringDays: serializeRecurringDays(c.recurringDays),
        recurrenceEndDate: c.recurrenceEndDate || null,
      },
    });
  } catch (error) {
    console.error("Get Live Class Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to fetch live class.",
    });
  }
};

module.exports = {
  getDashboardSummary,
  getStudents,
  getTrainers,
  deleteStudent,
  deleteAllStudents,
  deleteTrainer,
  toggleTrainerStatus,
  createLiveClass,
  updateLiveClass,
  deleteLiveClass,
  testSessionReminderWhatsapp,
  testWhatsappReminderManual,
  getDeleteRequests,
  approveDeleteRequest,
  rejectDeleteRequest,
  getLiveClasses,
  getLiveClass,
};
