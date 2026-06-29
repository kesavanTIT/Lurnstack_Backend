const express = require("express");
const router = express.Router();
const { getActiveOffers } = require("../controllers/offerController");

// @route   GET /api/offers/active
// @desc    Fetch current active offers
// @access  Public
router.get("/active", getActiveOffers);

module.exports = router;
