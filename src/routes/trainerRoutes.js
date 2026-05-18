const express = require("express");
const router = express.Router();

const {
  createSession,
  getTrainerSessions,
  getSingleTrainerSession,
  updateTrainerSession,
  deleteTrainerSession,
  publishSession,
  cancelSession,
} = require("../controllers/trainerSessionController");

const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

// ── Protect all trainer routes ─────────────────
// Every request must carry a valid Bearer JWT token.
// req.user.id is injected by the protect middleware.
router.use(protect);

// ── Trainer Session Endpoints ──────────────────

// POST   /api/trainer/sessions          → Create a new live session
router.post("/sessions", upload.single("thumbnail"), createSession);

// GET    /api/trainer/sessions          → List all sessions for the logged-in trainer
router.get("/sessions", getTrainerSessions);

// GET    /api/trainer/sessions/:sessionId → Fetch a single session
router.get("/sessions/:sessionId", getSingleTrainerSession);

// PATCH  /api/trainer/sessions/:sessionId → Partially update a session
router.patch("/sessions/:sessionId", upload.single("thumbnail"), updateTrainerSession);

// PATCH  /api/trainer/sessions/:sessionId/publish → Publish a session
router.patch("/sessions/:sessionId/publish", publishSession);

// PATCH  /api/trainer/sessions/:sessionId/cancel → Cancel a session
router.patch("/sessions/:sessionId/cancel", cancelSession);

// DELETE /api/trainer/sessions/:sessionId → Delete a session
router.delete("/sessions/:sessionId", deleteTrainerSession);

module.exports = router;
