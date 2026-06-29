const prisma = require("../config/db");

// ─────────────────────────────────────────────
// @desc    Get active offers (isActive = true & startsAt <= now & endsAt >= now)
// @route   GET /api/offers/active
// @access  Public
// ─────────────────────────────────────────────
const getActiveOffers = async (req, res) => {
  try {
    const now = new Date();
    const activeOffers = await prisma.offer.findMany({
      where: {
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      success: true,
      message: "Active offers fetched successfully.",
      data: activeOffers,
    });
  } catch (error) {
    console.error("Get Active Offers Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to fetch active offers.",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Get all offers (for administration)
// @route   GET /api/admin/offers
// @access  Private/Admin
// ─────────────────────────────────────────────
const getAdminOffers = async (req, res) => {
  try {
    const offers = await prisma.offer.findMany({
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      success: true,
      message: "All offers fetched successfully.",
      data: offers,
    });
  } catch (error) {
    console.error("Get Admin Offers Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to fetch offers.",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Create a new offer rule
// @route   POST /api/admin/offers
// @access  Private/Admin
// ─────────────────────────────────────────────
const createAdminOffer = async (req, res) => {
  try {
    const {
      title,
      discountType,
      discountValue,
      offerType,
      targetCategoryId,
      targetCourseId,
      startsAt,
      endsAt,
      isActive,
    } = req.body;

    // Field presence checks
    if (!title || !discountType || discountValue === undefined || !offerType || !startsAt || !endsAt) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields. Please provide title, discountType, discountValue, offerType, startsAt, and endsAt.",
      });
    }

    // Enum validation
    const validDiscountTypes = ["PERCENTAGE", "FLAT_AMOUNT", "CASHBACK"];
    if (!validDiscountTypes.includes(discountType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid discountType. Allowed: ${validDiscountTypes.join(", ")}`,
      });
    }

    const validOfferTypes = ["CATEGORY_WIDE", "COURSE_SPECIFIC", "FLASH_DEAL"];
    if (!validOfferTypes.includes(offerType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid offerType. Allowed: ${validOfferTypes.join(", ")}`,
      });
    }

    // Value checks
    const val = parseFloat(discountValue);
    if (isNaN(val) || val <= 0) {
      return res.status(400).json({
        success: false,
        message: "discountValue must be a positive number.",
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

    const newOffer = await prisma.offer.create({
      data: {
        title,
        discountType,
        discountValue: val,
        offerType,
        targetCategoryId: targetCategoryId || null,
        targetCourseId: targetCourseId || null,
        startsAt: startDate,
        endsAt: endDate,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Offer created successfully.",
      data: newOffer,
    });
  } catch (error) {
    console.error("Create Admin Offer Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to create offer.",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Delete an offer rule
// @route   DELETE /api/admin/offers/:id
// @access  Private/Admin
// ─────────────────────────────────────────────
const deleteAdminOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const offerId = parseInt(id, 10);

    if (isNaN(offerId)) {
      return res.status(400).json({
        success: false,
        message: "Offer ID must be a valid number.",
      });
    }

    // Check if offer exists
    const existing = await prisma.offer.findUnique({
      where: { id: offerId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Offer not found.",
      });
    }

    await prisma.offer.delete({
      where: { id: offerId },
    });

    return res.status(200).json({
      success: true,
      message: "Offer deleted successfully.",
      data: null,
    });
  } catch (error) {
    console.error("Delete Admin Offer Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to delete offer.",
      error: error.message,
    });
  }
};

module.exports = {
  getActiveOffers,
  getAdminOffers,
  createAdminOffer,
  deleteAdminOffer,
};
