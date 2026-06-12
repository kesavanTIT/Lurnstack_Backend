const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { handleAIChat } = require("../controllers/aiController");

// @route   POST /api/ai/chat
// @access  Private (Logged-in students)
router.post("/chat", protect, handleAIChat);

module.exports = router;
