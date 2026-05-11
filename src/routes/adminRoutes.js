const express = require("express");
const router = express.Router();
const {
  createLiveClass,
  updateLiveClass,
  deleteLiveClass,
} = require("../controllers/adminController");
const { protect, adminOnly } = require("../middleware/authMiddleware");

// Apply protection to all routes in this file
router.use(protect);
router.use(adminOnly);

// @route   POST /api/admin/create-live-class
router.post("/create-live-class", createLiveClass);

// @route   PUT /api/admin/update-live-class/:classId
router.put("/update-live-class/:classId", updateLiveClass);

// @route   DELETE /api/admin/delete-live-class/:classId
router.delete("/delete-live-class/:classId", deleteLiveClass);

module.exports = router;
