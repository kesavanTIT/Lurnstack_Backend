const express = require("express");
const router = express.Router();
const { getActivePromoPosters } = require("../controllers/promoController");
const { getActiveReels } = require("../controllers/reelController");

// @route   GET /api/promos/posters
// @desc    Fetch active promo posters
// @access  Public
router.get("/posters", getActivePromoPosters);

// @route   GET /api/promos/reels
// @desc    Fetch active video reels
// @access  Public
router.get("/reels", getActiveReels);

module.exports = router;
