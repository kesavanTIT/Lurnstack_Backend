const prisma = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// ─────────────────────────────────────────────
// @desc    Register a new admin (role hardcoded as 'admin')
// @route   POST /api/admin/register
// @access  Public (or semi-public for setup)
// ─────────────────────────────────────────────
const registerAdmin = async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields: fullName, email, and password.",
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: email },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newAdmin = await prisma.user.create({
      data: {
        fullName: fullName,
        email: email,
        password: hashedPassword,
        role: "ADMIN", // Hardcoded as 'ADMIN'
      },
    });

    const token = jwt.sign(
      { id: newAdmin.id, role: newAdmin.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const { password: _pw, ...adminWithoutPassword } = newAdmin;

    return res.status(201).json({
      success: true,
      message: "Admin registered successfully!",
      data: {
        admin: adminWithoutPassword,
        token,
      },
    });
  } catch (error) {
    console.error("Admin Register Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Authenticate admin & return JWT token
// @route   POST /api/admin/login
// @access  Public
// ─────────────────────────────────────────────
const loginAdmin = async (req, res) => {
  try {
    // 1. Extract email and password from multiple potential key names (lowercase and uppercase)
    const rawEmail = req.body.email || req.body.EMAIL_ADDRESS;
    const rawPassword = req.body.password || req.body.PASSWORD;

    // Normalize email (lowercase and trimmed)
    const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
    const password = typeof rawPassword === "string" ? rawPassword : "";

    // 2. Validate input is not empty to prevent Prisma query/validation errors
    if (!email || !password) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // 3. Fetch admin user from DB
    let user;
    try {
      user = await prisma.user.findUnique({
        where: { email: email },
      });
    } catch (dbError) {
      console.error("Database connection or query failed during admin login:", dbError);
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // 4. Verify user exists and has ADMIN role
    if (!user || !user.role || user.role.toUpperCase() !== "ADMIN") {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // 5. Compare passwords with safety check for bcrypt errors
    let isPasswordValid = false;
    try {
      if (user.password) {
        isPasswordValid = await bcrypt.compare(password, user.password);
      }
    } catch (bcryptError) {
      console.error("Password comparison failed with error:", bcryptError);
      isPasswordValid = false;
    }

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // 6. Sign JWT token (with fallback safety if JWT_SECRET is missing)
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error("❌ CRITICAL: JWT_SECRET environment variable is missing!");
      return res.status(500).json({
        success: false,
        message: "Internal server error. Server configuration missing.",
      });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      jwtSecret,
      { expiresIn: "7d" }
    );

    // 7. Set admin token cookie
    res.cookie("admin_token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    const adminResponseData = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role.toLowerCase(), // Return "admin"
    };

    // 8. Return response supporting multiple structures (root-level and nested under 'data')
    return res.status(200).json({
      success: true,
      message: "Admin login successful!",
      token,
      admin: adminResponseData,
      data: {
        token,
        admin: adminResponseData,
      },
    });
  } catch (error) {
    console.error("Unhandled Admin Login Error:", error);
    return res.status(401).json({
      success: false,
      message: "Invalid email or password",
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Get current admin profile
// @route   GET /api/admin/me
// @access  Private (Admin Only)
// ─────────────────────────────────────────────
const getAdminMe = async (req, res) => {
  try {
    const admin = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    if (!admin || admin.role !== "ADMIN") {
      return res.status(404).json({
        success: false,
        message: "Admin profile not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Admin profile fetched successfully!",
      data: admin,
    });
  } catch (error) {
    console.error("Get Admin Me Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Logout admin & clear cookie
// @route   POST /api/admin/logout
// @access  Public / Private
// ─────────────────────────────────────────────
const logoutAdmin = async (req, res) => {
  res.clearCookie("admin_token", {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    path: "/"
  });
  return res.status(200).json({
    success: true,
    message: "Admin logged out successfully!"
  });
};

module.exports = { registerAdmin, loginAdmin, getAdminMe, logoutAdmin };
