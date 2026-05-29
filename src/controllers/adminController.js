const { Prisma } = require("@prisma/client");
const prisma = require("../config/db");
const { sendSessionReminderWhatsApp } = require("../services/whatsappService");

const dashboardUserSelect = {
  id: true,
  fullName: true,
  email: true,
  phoneNumber: true,
  createdAt: true,
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

// @desc    Create a new live class
// @route   POST /api/admin/create-live-class
// @access  Private/Admin
const createLiveClass = async (req, res) => {
  try {
    const {
      courseName,
      classTitle,
      instructor,
      description,
      date,
      time,
      duration,
      meetLink,
    } = req.body;

    const thumbnail = req.file ? req.file.path : null;

    if (!courseName || !classTitle || !instructor || !date || !time || !duration || !meetLink) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields (courseName, classTitle, instructor, date, time, duration, meetLink).",
      });
    }

    const scheduledAt = parseScheduledAt(date, time);
    const durationMinutes = parseDurationMinutes(duration);

    const newClass = await prisma.liveClass.create({
      data: {
        courseName,
        classTitle,
        instructor,
        description,
        date,
        time,
        duration,
        scheduledAt,
        durationMinutes,
        meetLink,
        thumbnail,
      },
    });

    if (newClass.thumbnail) {
      newClass.thumbnail = `${req.protocol}://${req.get("host")}/${newClass.thumbnail.replace(/\\/g, "/")}`;
    }

    return res.status(201).json({
      success: true,
      message: "Live class created successfully!",
      data: newClass,
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
    const rawId = req.params.classId;
    const classIdInt = Number.parseInt(rawId, 10);
    const isNumericId = !Number.isNaN(classIdInt) && String(classIdInt) === String(rawId);

    const {
      courseName,
      classTitle,
      instructor,
      description,
      date,
      time,
      duration,
      meetLink,
    } = req.body;

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
          classTitle: classTitle || existingClass.classTitle,
          instructor: instructor || existingClass.instructor,
          description: description !== undefined ? description : existingClass.description,
          date: newDate,
          time: newTime,
          duration: duration || existingClass.duration,
          scheduledAt,
          durationMinutes,
          meetLink: meetLink || existingClass.meetLink,
          thumbnail: req.file ? req.file.path : existingClass.thumbnail,
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
      if (classTitle !== undefined) {
        updateData.title = classTitle;
        updateData.classTitle = classTitle; // legacy column
      }
      if (description !== undefined) {
        updateData.description = description;
      }
      if (meetLink !== undefined) {
        updateData.meetingLink = meetLink;
      }
      if (courseName !== undefined) {
        updateData.courseTitle = courseName; // legacy column
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
        
        const newEndTime = addMinutesToTime(formattedTime, durationMinutes);
        if (newEndTime) {
          updateData.endTime = newEndTime;
        }

        updateData.scheduledDate = checkDate;
        updateData.scheduledAt = `${checkDate} ${formattedTime}`;
        updateData.endsAt = newEndTime ? `${checkDate} ${newEndTime}` : undefined;
      }

      const updatedSession = await prisma.liveSession.update({
        where: { id: rawId },
        data: updateData,
        include: { trainer: true },
      });

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

      await prisma.liveSession.delete({
        where: { id: rawId },
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
};

