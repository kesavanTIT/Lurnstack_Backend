const express = require("express");
const router = express.Router();
const { protect, adminOnly } = require("../middleware/authMiddleware");
const { tridinOnly } = require("../middleware/authMiddleware");
const { loginUser } = require("../controllers/authController");
const {
  getTridinCourses,
  getTridinProfile,
  createTridinCandidate,
  listTridinCandidates,
  deleteTridinCandidate,
  toggleTridinSession,
} = require("../controllers/tridinController");
const {
  getCandidateCoursePlaylist,
  recordVideoProgress,
  getCandidateAssessment,
  submitCandidateAssessment,
} = require("../controllers/tridinLmsController");

// ── Tridin Candidate Routes ───────────────────────────
// POST /api/tridin/login   → login endpoint
router.post("/login", loginUser);

// GET /api/tridin/courses  → list all Tridin-only courses
router.get("/courses", protect, getTridinCourses);

// GET /api/tridin/me       → get own profile
router.get("/me", protect, tridinOnly, getTridinProfile);

// ── Tridin Candidate 1-by-1 Video Playlist & Assessment ──────
// GET  /api/tridin/courses/:sessionId/playlist  → 1-by-1 video playlist with lock states
router.get("/courses/:sessionId/playlist", protect, tridinOnly, getCandidateCoursePlaylist);

// POST /api/tridin/videos/:videoId/progress     → video watch progress heartbeat / completed
router.post("/videos/:videoId/progress", protect, tridinOnly, recordVideoProgress);

// GET  /api/tridin/videos/:videoId/assessment   → get quiz questions (excludes correctOption)
router.get("/videos/:videoId/assessment", protect, tridinOnly, getCandidateAssessment);

// POST /api/tridin/videos/:videoId/assessment/submit → submit test & evaluate pass/fail
router.post("/videos/:videoId/assessment/submit", protect, tridinOnly, submitCandidateAssessment);

// ── Admin: Tridin Candidate Management ───────────────
// POST /api/tridin/admin/candidates        → create a candidate
router.post("/admin/candidates", protect, adminOnly, createTridinCandidate);

// GET  /api/tridin/admin/candidates        → list all candidates
router.get("/admin/candidates", protect, adminOnly, listTridinCandidates);

// DELETE /api/tridin/admin/candidates/:id  → delete a candidate
router.delete("/admin/candidates/:id", protect, adminOnly, deleteTridinCandidate);

// PATCH /api/tridin/admin/sessions/:id     → toggle isTridinOnly on a session
router.patch("/admin/sessions/:id", protect, adminOnly, toggleTridinSession);

module.exports = router;
