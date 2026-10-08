const express = require("express");
const router = express.Router();
const { protect, adminOnly } = require("../middleware/authMiddleware");
const { tridinOnly } = require("../middleware/authMiddleware");
const {
  getTridinCourses,
  getTridinProfile,
  createTridinCandidate,
  listTridinCandidates,
  deleteTridinCandidate,
  toggleTridinSession,
} = require("../controllers/tridinController");

// ── Tridin Candidate Routes ───────────────────────────
// GET /api/tridin/courses  → list all Tridin-only courses
router.get("/courses", protect, tridinOnly, getTridinCourses);

// GET /api/tridin/me       → get own profile
router.get("/me", protect, tridinOnly, getTridinProfile);

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
