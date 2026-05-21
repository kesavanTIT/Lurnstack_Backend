const express = require("express");
const router = express.Router();
const { handleRazorpayWebhook } = require("../controllers/webhookController");

// POST /api/webhooks/razorpay
router.post("/razorpay", handleRazorpayWebhook);

module.exports = router;
