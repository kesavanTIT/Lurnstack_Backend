const express = require("express");
const router = express.Router();
const {
  getPublicSessions,
  getPublicSessionById,
} = require("../controllers/publicSessionController");
const {
  getUpcomingSessions,
} = require("../controllers/sessionReminderController");

// @route   GET /api/sessions/upcoming
// @desc    Get all PUBLISHED sessions with pricing state (Free / Paid badge data)
// @access  Public
// NOTE: This MUST be declared before /:sessionId to prevent Express
//       from matching the string "upcoming" as a sessionId param.
router.get("/upcoming", getUpcomingSessions);

// @route   GET /api/sessions
// @desc    Get all active/published live sessions (Public guest access)
// @access  Public
router.get("/", getPublicSessions);

// @route   GET /api/sessions/:sessionId
// @desc    Get a single active/published live session details (Public guest access)
// @access  Public
router.get("/:sessionId", getPublicSessionById);

module.exports = router;

