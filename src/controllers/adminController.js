const prisma = require("../config/db");

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

    const newClass = await prisma.liveClass.create({
      data: {
        courseName,
        classTitle,
        instructor,
        description,
        date,
        time,
        duration,
        meetLink,
        thumbnail,
      },
    });

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

    const updatedClass = await prisma.liveClass.update({
      where: { id: parseInt(classId) },
      data: {
        courseName: courseName || existingClass.courseName,
        classTitle: classTitle || existingClass.classTitle,
        instructor: instructor || existingClass.instructor,
        description: description !== undefined ? description : existingClass.description,
        date: date || existingClass.date,
        time: time || existingClass.time,
        duration: duration || existingClass.duration,
        meetLink: meetLink || existingClass.meetLink,
        thumbnail: thumbnail,
      },
    });

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
