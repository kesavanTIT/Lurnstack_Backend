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
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email: email },
    });

    if (!user || user.role !== "ADMIN") {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials or not an admin.",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials.",
      });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      success: true,
      message: "Admin login successful!",
      data: {
        admin: {
          fullName: user.fullName,
          email: user.email,
          role: user.role,
        },
        token,
      },
    });
  } catch (error) {
    console.error("Admin Login Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
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

module.exports = { registerAdmin, loginAdmin, getAdminMe };
