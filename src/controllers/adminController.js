const prisma = require("../config/db");

// Helper to parse date (YYYY-MM-DD) and time (HH:mm AM/PM) into IST Date object
const parseScheduledAt = (dateStr, timeStr) => {
  try {
    // Normalize time separator (handle 10.30 instead of 10:30)
    const normalizedTime = timeStr.replace(".", ":");
    const [year, month, day] = dateStr.split("-").map(Number);
    let [time, modifier] = normalizedTime.split(" ");
    let [hours, minutes] = time.split(":").map(Number);

    if (modifier === "PM" && hours < 12) hours += 12;
    if (modifier === "AM" && hours === 12) hours = 0;

    // Create ISO string with IST offset (+05:30)
    const isoStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00+05:30`;
    const date = new Date(isoStr);
    return isNaN(date.getTime()) ? null : date;
  } catch (error) {
    return null;
  }
};


// Helper to parse duration string (e.g., "2 Hours", "90 Minutes") into minutes integer
const parseDurationMinutes = (durationStr) => {
  if (!durationStr) return 60;
  if (!isNaN(durationStr)) return parseInt(durationStr);

  const parts = durationStr.toString().toLowerCase().split(" ");
  const val = parseInt(parts[0]);
  if (parts.includes("hour") || parts.includes("hours")) {
    return val * 60;
  }
  return val || 60; // Default to 60 if parsing fails
};


// ─────────────────────────────────────────────
// @desc    Create a new live class
// @route   POST /api/admin/create-live-class
// @access  Private/Admin
// ─────────────────────────────────────────────
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

    // Check if thumbnail was uploaded
    const thumbnail = req.file ? req.file.path : null;

    // Validation
    if (!courseName || !classTitle || !instructor || !date || !time || !duration || !meetLink) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields (courseName, classTitle, instructor, date, time, duration, meetLink).",
      });
    }

    // Parse scheduledAt and durationMinutes
    const scheduledAt = parseScheduledAt(date, time);
    const durationMinutes = parseDurationMinutes(duration);

    const newClass = await prisma.liveClass.create({
      data: {
        courseName,
        classTitle,
        instructor,
        description,
        date, // Keep string for UI
        time, // Keep string for UI
        duration, // Keep string for UI
        scheduledAt,
        durationMinutes,
        meetLink,
        thumbnail,
      },
    });


    if (newClass.thumbnail) {
      newClass.thumbnail = `${req.protocol}://${req.get("host")}/${newClass.thumbnail.replace(/\\/g, "/")}`;
    }

    res.status(201).json({
      success: true,
      message: "Live class created successfully!",
      data: newClass,
    });

  } catch (error) {
    console.error("Create Live Class Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error. Failed to create class.",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Update an existing live class
// @route   PUT /api/admin/update-live-class/:classId
// @access  Private/Admin
// ─────────────────────────────────────────────
const updateLiveClass = async (req, res) => {
  try {
    const { classId } = req.params;
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
      where: { id: parseInt(classId) },
    });

    if (!existingClass) {
      return res.status(404).json({
        success: false,
        message: "Live class not found.",
      });
    }

    // Handle thumbnail update
    let thumbnail = existingClass.thumbnail;
    if (req.file) {
      thumbnail = req.file.path;
    }

    // Parse updated scheduledAt and durationMinutes if provided
    const newDate = date || existingClass.date;
    const newTime = time || existingClass.time;
    const scheduledAt = parseScheduledAt(newDate, newTime);
    const durationMinutes = parseDurationMinutes(duration || existingClass.duration);

    const updatedClass = await prisma.liveClass.update({
      where: { id: parseInt(classId) },
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
        thumbnail: thumbnail,
      },
    });


    if (updatedClass.thumbnail) {
      updatedClass.thumbnail = `${req.protocol}://${req.get("host")}/${updatedClass.thumbnail.replace(/\\/g, "/")}`;
    }

    res.status(200).json({
      success: true,
      message: "Live class updated successfully!",
      data: updatedClass,
    });

  } catch (error) {
    console.error("Update Live Class Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error. Failed to update class.",
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Delete a live class
// @route   DELETE /api/admin/delete-live-class/:classId
// @access  Private/Admin
// ─────────────────────────────────────────────
const deleteLiveClass = async (req, res) => {
  try {
    const { classId } = req.params;

    const existingClass = await prisma.liveClass.findUnique({
      where: { id: parseInt(classId) },
    });

    if (!existingClass) {
      return res.status(404).json({
        success: false,
        message: "Live class not found.",
      });
    }

    await prisma.liveClass.delete({
      where: { id: parseInt(classId) },
    });

    res.status(200).json({
      success: true,
      message: "Live class deleted successfully!",
      data: { id: classId }
    });
  } catch (error) {
    console.error("Delete Live Class Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error. Failed to delete class.",
    });
  }
};

module.exports = {
  createLiveClass,
  updateLiveClass,
  deleteLiveClass,
};
