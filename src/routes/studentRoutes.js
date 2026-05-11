const express = require("express");
const router = express.Router();
const {
  getAllLiveClasses,
  getLiveClassById,
  joinLiveClass,
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

module.exports = router;
