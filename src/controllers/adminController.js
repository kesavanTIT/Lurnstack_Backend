const { Prisma } = require("@prisma/client");
const prisma = require("../config/db");

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
    const id = parseClassId(req.params.classId);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Invalid live class ID.",
      });
    }

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

    const existingClass = await prisma.liveClass.findUnique({
      where: { id },
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
      where: { id },
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
  } catch (error) {
    console.error("Update Live Class Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to update class.",
    });
  }
};

// @desc    Delete a live class
// @route   DELETE /api/admin/delete-live-class/:classId
// @access  Private/Admin
const deleteLiveClass = async (req, res) => {
  try {
    const id = parseClassId(req.params.classId);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Invalid live class ID.",
      });
    }

    const existingClass = await prisma.liveClass.findUnique({
      where: { id },
    });

    if (!existingClass) {
      return res.status(404).json({
        success: false,
        message: "Live class not found.",
      });
    }

    await prisma.liveClass.delete({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      message: "Live class deleted successfully!",
    });
  } catch (error) {
    console.error("Delete Live Class Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to delete class.",
    });
  }
};

module.exports = {
  getDashboardSummary,
  getStudents,
  getTrainers,
  deleteStudent,
  deleteTrainer,
  toggleTrainerStatus,
  createLiveClass,
  updateLiveClass,
  deleteLiveClass,
};
