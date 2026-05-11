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
      thumbnail,
    } = req.body;

    // Validation
    if (!courseName || !classTitle || !instructor || !date || !time || !duration || !meetLink) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields.",
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
    const { date, time, meetLink, description, classTitle } = req.body;

    const existingClass = await prisma.liveClass.findUnique({
      where: { id: parseInt(classId) },
    });

    if (!existingClass) {
      return res.status(404).json({
        success: false,
        message: "Live class not found.",
      });
    }

    const updatedClass = await prisma.liveClass.update({
      where: { id: parseInt(classId) },
      data: {
        date: date || existingClass.date,
        time: time || existingClass.time,
        meetLink: meetLink || existingClass.meetLink,
        description: description || existingClass.description,
        classTitle: classTitle || existingClass.classTitle,
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
