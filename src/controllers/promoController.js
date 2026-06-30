const prisma = require("../config/db");

// ─────────────────────────────────────────────
// @desc    Get active promo posters (isActive = true & startsAt <= now & endsAt >= now)
// @route   GET /api/promos/posters
// @access  Public
// ─────────────────────────────────────────────
const getActivePromoPosters = async (req, res) => {
  try {
    const now = new Date();
    const activePosters = await prisma.promoPoster.findMany({
      where: {
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      success: true,
      message: "Active promo posters fetched successfully.",
      data: activePosters,
    });
  } catch (error) {
    console.error("Get Active Promo Posters Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to fetch active promo posters.",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Create a new promo poster (Uploads banner image)
// @route   POST /api/admin/promos/posters
// @access  Private/Admin
// ─────────────────────────────────────────────
const createAdminPromoPoster = async (req, res) => {
  try {
    const { title, linkUrl, startsAt, endsAt, isActive } = req.body;

    // Check if file is uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided. Please upload an image for the poster.",
      });
    }

    // Check required fields
    if (!title || !startsAt || !endsAt) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields. Please provide title, startsAt, and endsAt.",
      });
    }

    const startDate = new Date(startsAt);
    const endDate = new Date(endsAt);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid startsAt or endsAt date format.",
      });
    }

    if (startDate >= endDate) {
      return res.status(400).json({
        success: false,
        message: "startsAt must be before endsAt.",
      });
    }

    // Standardize file path to forward slashes (e.g. uploads/promos/promo-xxx.png)
    const imageUrl = req.file.path.replace(/\\/g, "/");

    // Handle boolean conversion from multipart/form-data string
    const isActiveBool = isActive !== undefined ? (isActive === "true" || isActive === true) : true;

    const newPoster = await prisma.promoPoster.create({
      data: {
        title,
        imageUrl,
        linkUrl: linkUrl || null,
        startsAt: startDate,
        endsAt: endDate,
        isActive: isActiveBool,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Promo poster created successfully.",
      data: newPoster,
    });
  } catch (error) {
    console.error("Create Admin Promo Poster Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to create promo poster.",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Get all promo posters (active & inactive)
// @route   GET /api/admin/promos/posters
// @access  Private/Admin
// ─────────────────────────────────────────────
const getAdminPromoPosters = async (req, res) => {
  try {
    const posters = await prisma.promoPoster.findMany({
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      success: true,
      message: "All promo posters fetched successfully.",
      data: posters,
    });
  } catch (error) {
    console.error("Get Admin Promo Posters Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to fetch promo posters.",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Delete a promo poster (and local file)
// @route   DELETE /api/admin/promos/posters/:id
// @access  Private/Admin
// ─────────────────────────────────────────────
const deleteAdminPromoPoster = async (req, res) => {
  try {
    const { id } = req.params;
    const posterId = parseInt(id, 10);
    if (isNaN(posterId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid poster ID format.",
      });
    }

    const poster = await prisma.promoPoster.findUnique({
      where: { id: posterId },
    });

    if (!poster) {
      return res.status(404).json({
        success: false,
        message: "Promo poster not found.",
      });
    }

    // Delete local image file if it exists
    if (poster.imageUrl) {
      const fs = require("fs");
      const path = require("path");
      const filePath = path.join(__dirname, "../../", poster.imageUrl);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log(`Deleted local file: ${filePath}`);
        } catch (fileErr) {
          console.error("Failed to delete local file:", fileErr);
        }
      }
    }

    // Delete from database
    await prisma.promoPoster.delete({
      where: { id: posterId },
    });

    return res.status(200).json({
      success: true,
      message: "Promo poster deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Admin Promo Poster Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to delete promo poster.",
      error: error.message,
    });
  }
};

module.exports = {
  getActivePromoPosters,
  createAdminPromoPoster,
  getAdminPromoPosters,
  deleteAdminPromoPoster,
};
