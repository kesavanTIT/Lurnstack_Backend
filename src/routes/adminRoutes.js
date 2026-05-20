const express = require("express");
const router = express.Router();
const {
  getDashboardSummary,
  getStudents,
  getTrainers,
  deleteStudent,
  deleteTrainer,
  toggleTrainerStatus,
  createLiveClass,
  updateLiveClass,
  deleteLiveClass,
} = require("../controllers/adminController");
const {
  registerAdmin,
  loginAdmin,
  getAdminMe,
} = require("../controllers/adminAuthController");
const { protect, isAdmin } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

// ── Public Admin Routes ───────────────────────
router.post("/register", registerAdmin);
router.post("/login", loginAdmin);

// ── Protected Admin Routes ────────────────────
// Apply protect and isAdmin to all routes below
router.use(protect);
router.use(isAdmin);

router.get("/me", getAdminMe);
router.get("/dashboard/summary", getDashboardSummary);
router.get("/students", getStudents);
router.get("/trainers", getTrainers);
router.delete("/students/:id", deleteStudent);
router.delete("/trainers/:id", deleteTrainer);
router.patch("/trainers/:id/status", toggleTrainerStatus);

// Live Class Management
router.post("/create-live-class", upload.single("thumbnail"), createLiveClass);
router.put("/update-live-class/:classId", upload.single("thumbnail"), updateLiveClass);
router.delete("/delete-live-class/:classId", deleteLiveClass);

module.exports = router;
