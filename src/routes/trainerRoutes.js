const express = require("express");
const router = express.Router();

const {
  getTrainerStatus,
  getTrainerCourses,
  createSession,
  getTrainerSessions,
  getSingleTrainerSession,
  updateTrainerSession,
  deleteTrainerSession,
  pauseSession,
  resumeSession,
  endSession,
  cancelTodaySession,
  uncancelTodaySession,
} = require("../controllers/trainerSessionController");

const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

// ── Protect all trainer routes ─────────────────
router.use(protect);

// ── Trainer Status Endpoint ────────────────────
router.get("/status", getTrainerStatus);

// ── Trainer Courses Endpoint ───────────────────
router.get("/courses", getTrainerCourses);

// ── Trainer Session Endpoints ──────────────────
// POST   /api/trainer/sessions             → Create a new live session
router.post("/sessions", upload.single("thumbnail"), createSession);

// GET    /api/trainer/sessions             → List all sessions for the logged-in trainer
router.get("/sessions", getTrainerSessions);

// GET    /api/trainer/sessions/:sessionId  → Fetch a single session
router.get("/sessions/:sessionId", getSingleTrainerSession);

// PATCH  /api/trainer/sessions/:sessionId  → Partially update a session
router.patch("/sessions/:sessionId", upload.single("thumbnail"), updateTrainerSession);

// POST   /api/trainer/sessions/:sessionId/pause  → Pause the session
router.post("/sessions/:sessionId/pause", pauseSession);

// POST   /api/trainer/sessions/:sessionId/resume → Resume the session
router.post("/sessions/:sessionId/resume", resumeSession);

// POST   /api/trainer/sessions/:sessionId/end    → Permanently end the session
router.post("/sessions/:sessionId/end", endSession);

// POST   /api/trainer/sessions/:sessionId/cancel-today → Cancel the session for today
router.post("/sessions/:sessionId/cancel-today", cancelTodaySession);

// DELETE /api/trainer/sessions/:sessionId/cancel-today → Un-cancel today's session
router.delete("/sessions/:sessionId/cancel-today", uncancelTodaySession);

// DELETE /api/trainer/sessions/:sessionId  → Delete a session permanently
router.delete("/sessions/:sessionId", deleteTrainerSession);

module.exports = router;
