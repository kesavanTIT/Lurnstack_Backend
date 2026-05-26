const express = require("express");
const router = express.Router();
const {
  getPublicSessions,
  getPublicSessionById,
} = require("../controllers/publicSessionController");

// @route   GET /api/sessions
// @desc    Get all active/published live sessions (Public guest access)
// @access  Public
router.get("/", getPublicSessions);

// @route   GET /api/sessions/:sessionId
// @desc    Get a single active/published live session details (Public guest access)
// @access  Public
router.get("/:sessionId", getPublicSessionById);

module.exports = router;
