const express = require("express");
const router = express.Router();
const {
  getAllLiveClasses,
  getLiveClassById,
  joinLiveClass,
  getStudentSessions,
  getStudentSessionDetails,
  addSessionCard,
  removeSessionCard,
  getMySessionCards,
  joinSession,
  getMyJoinedSessions,
} = require("../controllers/studentController");
const { protect } = require("../middleware/authMiddleware");

// Apply protection to all student routes
router.use(protect);

// @route   GET /api/student/live-classes
router.get("/live-classes", getAllLiveClasses);

// @route   GET /api/student/live-class/:classId
router.get("/live-class/:classId", getLiveClassById);

// @route   POST /api/student/join-class/:classId
router.post("/join-class/:classId", joinLiveClass);

// ── NEW SESSION ENDPOINTS ──────────────────────

// @route   GET /api/student/sessions
router.get("/sessions", getStudentSessions);

// @route   GET /api/student/sessions/:sessionId
router.get("/sessions/:sessionId", getStudentSessionDetails);

// @route   POST /api/student/sessions/:sessionId/add-card
router.post("/sessions/:sessionId/add-card", addSessionCard);

// @route   DELETE /api/student/sessions/:sessionId/add-card
router.delete("/sessions/:sessionId/add-card", removeSessionCard);

// @route   GET /api/student/me/session-cards
router.get("/me/session-cards", getMySessionCards);

// @route   POST /api/student/sessions/:sessionId/join
router.post("/sessions/:sessionId/join", joinSession);

// @route   GET /api/student/me/session-bookings
router.get("/me/session-bookings", getMyJoinedSessions);

module.exports = router;
