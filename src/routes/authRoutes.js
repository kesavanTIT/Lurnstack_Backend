const express = require("express");
const router = express.Router();
const {
  registerUser,
  loginUser,
  sendOTP,
  verifyOTP,
  forgotPassword,
  resetPassword,
  initiateGoogleAuth,
  googleAuthCallback,
  getMe,
  updateProfile,
  deleteAccount,
  uploadProfilePhoto,
  deleteProfilePhoto,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");
const profilePhotoUploadMiddleware = require("../middleware/profileUploadMiddleware");

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

// ── Google OAuth routes ───────────────────────────────────────────────────────

// @route   GET /api/auth/google
// @desc    Initiate Google OAuth flow
// @access  Public
router.get("/google", initiateGoogleAuth);

// @route   GET /api/auth/google/callback
// @desc    Google OAuth callback handler
// @access  Public
router.get("/google/callback", googleAuthCallback);

// @route   GET /api/auth/me
// @desc    Get current authenticated user profile
// @access  Private (Authenticated Users)
router.get("/me", protect, getMe);

// @route   PUT /api/auth/profile
// @desc    Update current authenticated user profile details
// @access  Private (Authenticated Users)
router.put("/profile", protect, updateProfile);

// @route   DELETE /api/auth/profile
// @desc    Self-service account deletion (Soft Delete)
// @access  Private (Authenticated Users)
router.delete("/profile", protect, deleteAccount);

// @route   POST /api/auth/profile/photo
// @desc    Upload profile photo
// @access  Private (Authenticated Users)
router.post("/profile/photo", protect, profilePhotoUploadMiddleware, uploadProfilePhoto);

// @route   DELETE /api/auth/profile/photo
// @desc    Delete profile photo
// @access  Private (Authenticated Users)
router.delete("/profile/photo", protect, deleteProfilePhoto);

module.exports = router;



