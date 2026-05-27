const express = require("express");
const router = express.Router();
const {
  registerUser,
  loginUser,
  sendOTP,
  verifyOTP,
  forgotPassword,
  resetPassword,
} = require("../controllers/authController");

// ── Existing auth routes ──────────────────────────────────────────────────────

// @route   POST /api/auth/register
// @desc    Register a new user (role defaults to "STUDENT")
// @access  Public
router.post("/register", registerUser);

// @route   POST /api/auth/login
// @desc    Authenticate user and return JWT token
// @access  Public
router.post("/login", loginUser);

// ── OTP routes ────────────────────────────────────────────────────────────────

// @route   POST /api/auth/send-otp
// @desc    Generate & deliver a 6-digit OTP to an email or phone number
// @body    { identifier: string, type?: "email" | "sms" }
// @access  Public
router.post("/send-otp", sendOTP);

// @route   POST /api/auth/verify-otp
// @desc    Validate the OTP submitted by the user
// @body    { identifier: string, code: string }
// @access  Public
router.post("/verify-otp", verifyOTP);

// ── Forgot / Reset Password routes ───────────────────────────────────────────

// @route   POST /api/auth/forgot-password
// @desc    Generate & email a secure 15-min password reset link
// @body    { EMAIL_ADDRESS: string }
// @access  Public
router.post("/forgot-password", forgotPassword);

// @route   POST /api/auth/reset-password
// @desc    Verify reset token and update the user's password
// @body    { token: string, newPassword: string }
// @access  Public
router.post("/reset-password", resetPassword);

module.exports = router;



