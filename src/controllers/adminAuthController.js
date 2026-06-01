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
    const rawFullName = req.body.fullName || req.body.FULL_NAME || req.body.name;
    const rawEmail = req.body.email || req.body.EMAIL_ADDRESS;
    const rawPassword = req.body.password || req.body.PASSWORD;

    const fullName = typeof rawFullName === "string" ? rawFullName.trim() : "";
    const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
    const password = typeof rawPassword === "string" ? rawPassword : "";

    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields: fullName, email, and password.",
      });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: "insensitive",
        },
      },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newAdmin = await prisma.user.create({
      data: {
        fullName: fullName,
        email: email,
        password: hashedPassword,
        role: "ADMIN",
      },
    });

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error("JWT_SECRET is missing from environment variables.");
    }

    const token = jwt.sign(
      { id: newAdmin.id, role: newAdmin.role },
      jwtSecret,
      { expiresIn: "7d" }
    );

    res.cookie("admin_token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    const adminResponseData = {
      id: newAdmin.id,
      email: newAdmin.email,
      fullName: newAdmin.fullName,
      role: newAdmin.role.toLowerCase(), // "admin"
    };

    return res.status(201).json({
      success: true,
      message: "Admin registered successfully",
      token,
      admin: adminResponseData,
      data: {
        token,
        admin: adminResponseData,
      },
    });
  } catch (error) {
    console.error("Admin auth error:", error);
    return res.status(500).json({
      success: false,
      message: "Admin auth server error",
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

    // 3. Fetch admin user from DB (case-insensitive findFirst)
    const user = await prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: "insensitive",
        },
      },
    });

    // 4. Verify user exists and has ADMIN role
    if (!user || !user.role || user.role.toUpperCase() !== "ADMIN") {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // 5. Compare passwords with safety check for bcrypt errors
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // 6. Sign JWT token (with fallback safety if JWT_SECRET is missing)
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error("JWT_SECRET is missing from environment variables.");
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
      message: "Admin login successful",
      token,
      admin: adminResponseData,
      data: {
        token,
        admin: adminResponseData,
      },
    });
  } catch (error) {
    console.error("Admin auth error:", error);
    return res.status(500).json({
      success: false,
      message: "Admin auth server error",
      error: error.message
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
