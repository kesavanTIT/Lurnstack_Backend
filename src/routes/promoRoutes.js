const express = require("express");
const router = express.Router();
const { getActivePromoPosters } = require("../controllers/promoController");

// @route   GET /api/promos/posters
// @desc    Fetch active promo posters
// @access  Public
router.get("/posters", getActivePromoPosters);

module.exports = router;
