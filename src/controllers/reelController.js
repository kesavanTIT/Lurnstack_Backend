const prisma = require("../config/db");
const { getRelativeUploadPath } = require("../utils/pathUtils");
const fs = require("fs");
const path = require("path");

// @desc    Get all active video reels
// @route   GET /api/student/reels
// @access  Public
const getActiveReels = async (req, res) => {
  try {
    const reels = await prisma.videoReel.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      success: true,
      message: "Active video reels fetched successfully.",
      data: reels,
    });
  } catch (error) {
    console.error("Get Active Reels Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to fetch active video reels.",
      error: error.message,
    });
  }
};

// @desc    Get all video reels (active & inactive)
// @route   GET /api/admin/reels
// @access  Private/Admin
const getAdminReels = async (req, res) => {
  try {
    const reels = await prisma.videoReel.findMany({
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      success: true,
      message: "All video reels fetched successfully.",
      data: reels,
    });
  } catch (error) {
    console.error("Get Admin Reels Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to fetch video reels.",
      error: error.message,
    });
  }
};

// @desc    Create a new video reel
// @route   POST /api/admin/reels
// @access  Private/Admin
const createAdminReel = async (req, res) => {
  try {
    const { courseName, trainerName, caption, audioTitle, ctaText, isLive, isActive } = req.body;

    // Check if video file is uploaded
    const videoFile = req.files && req.files["video"] ? req.files["video"][0] : null;
    const logoFile = req.files && req.files["logo"] ? req.files["logo"][0] : null;

    if (!videoFile) {
      return res.status(400).json({
        success: false,
        message: "No video file provided. Please upload a video file.",
      });
    }

    if (!courseName || !trainerName || !caption || !audioTitle) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields. Please fill in all required text fields.",
      });
    }

    const videoSrc = getRelativeUploadPath(videoFile.path);
    const avatarUrl = logoFile ? getRelativeUploadPath(logoFile.path) : null;

    const isLiveBool = isLive !== undefined ? (isLive === "true" || isLive === true) : true;
    const isActiveBool = isActive !== undefined ? (isActive === "true" || isActive === true) : true;

    const newReel = await prisma.videoReel.create({
      data: {
        courseName,
        trainerName,
        caption,
        audioTitle,
        ctaText: ctaText || "Register",
        isLive: isLiveBool,
        isActive: isActiveBool,
        videoSrc,
        avatarUrl,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Video Reel created successfully.",
      data: newReel,
    });
  } catch (error) {
    console.error("Create Admin Reel Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to create video reel.",
      error: error.message,
    });
  }
};

// @desc    Delete a video reel (and local files)
// @route   DELETE /api/admin/reels/:id
// @access  Private/Admin
const deleteAdminReel = async (req, res) => {
  try {
    const { id } = req.params;

    const reel = await prisma.videoReel.findUnique({
      where: { id },
    });

    if (!reel) {
      return res.status(404).json({
        success: false,
        message: "Video reel not found.",
      });
    }

    // Helper to delete disk files
    const deleteDiskFile = (relPath) => {
      if (!relPath) return;
      const filePath = path.join(__dirname, "../../", relPath);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log(`Deleted local file: ${filePath}`);
        } catch (fileErr) {
          console.error("Failed to delete local file:", fileErr);
        }
      }
    };

    // Delete local files
    deleteDiskFile(reel.videoSrc);
    deleteDiskFile(reel.avatarUrl);

    // Delete database record
    await prisma.videoReel.delete({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      message: "Video reel deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Admin Reel Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to delete video reel.",
      error: error.message,
    });
  }
};

module.exports = {
  getActiveReels,
  getAdminReels,
  createAdminReel,
  deleteAdminReel,
};
