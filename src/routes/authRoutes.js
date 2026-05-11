const express = require("express");
const router = express.Router();
const { registerUser, loginUser } = require("../controllers/authController");

// @route   POST /api/auth/register
// @desc    Register a new user (role defaults to "student")
// @access  Public
router.post("/register", registerUser);

// @route  POST /api/auth/login
// @desc    Authenticate user and return JWT token
// @access  Public
router.post("/login", loginUser);

module.exports = router;

