const prisma = require("../config/db");

// ─────────────────────────────────────────────
// @desc    Get all live classes
// @route   GET /api/student/live-classes
// @access  Private (Logged-in students)
// ─────────────────────────────────────────────
const getAllLiveClasses = async (req, res) => {
  try {
    const liveClasses = await prisma.liveClass.findMany({
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({
      success: true,
      data: liveClasses,
    });
  } catch (error) {
    console.error("Get All Live Classes Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error. Failed to fetch classes.",
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

    const liveClass = await prisma.liveClass.findUnique({
      where: { id: parseInt(classId) },
    });

    if (!liveClass) {
      return res.status(404).json({
        success: false,
        message: "Live class not found.",
      });
    }

    res.status(200).json({
      success: true,
      data: liveClass,
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

    const liveClass = await prisma.liveClass.findUnique({
      where: { id: parseInt(classId) },
      select: { meetLink: true }, // Only need the meet link
    });

    if (!liveClass) {
      return res.status(404).json({
        success: false,
        message: "Live class not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Successfully joined the class!",
      meetLink: liveClass.meetLink,
    });
  } catch (error) {
    console.error("Join Live Class Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error. Failed to join class.",
    });
  }
};

module.exports = {
  getAllLiveClasses,
  getLiveClassById,
  joinLiveClass,
};
