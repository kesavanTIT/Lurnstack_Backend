const prisma = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// ─────────────────────────────────────────────
// @desc    Register a new user (STUDENT or TRAINER)
// @route   POST /api/auth/register
// @access  Public
// ─────────────────────────────────────────────
const registerUser = async (req, res) => {
  try {
    // 1. Extract fields from request body
    //    role is optional — defaults to STUDENT if not provided.
    const { FULL_NAME, EMAIL_ADDRESS, PASSWORD, role } = req.body;

    // 2. Validation — ensure all required fields are present
    if (!FULL_NAME || !EMAIL_ADDRESS || !PASSWORD) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields: FULL_NAME, EMAIL_ADDRESS, and PASSWORD.",
      });
    }

    // 3. Resolve role — accept 'TRAINER' from UI toggle; default everything else to STUDENT
    const userRole = role === "TRAINER" ? "TRAINER" : "STUDENT";

    // 4. Duplicate check — make sure the email is not already registered
    const existingUser = await prisma.user.findUnique({
      where: { email: EMAIL_ADDRESS },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "An account with this email already exists. Please log in.",
      });
    }

    // 5. Security — hash the password before saving (salt rounds: 12)
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(PASSWORD, salt);

    // 6. Create the new user record in the database
    const newUser = await prisma.user.create({
      data: {
        fullName: FULL_NAME,
        email: EMAIL_ADDRESS,
        password: hashedPassword,
        role: userRole, // Enum: STUDENT | TRAINER
      },
    });

    // 7. Return user data excluding password with 201 Created status
    const { password: _pw, ...userWithoutPassword } = newUser;

    return res.status(201).json({
      success: true,
      message: "Account created successfully!",
      user: userWithoutPassword,
    });
  } catch (error) {
    console.error("Register Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Please try again.",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Authenticate user & return JWT token
// @route   POST /api/auth/login
// @access  Public
// ─────────────────────────────────────────────
const loginUser = async (req, res) => {
  try {
    // 1. Extract UI-matching uppercase fields from request body
    const { EMAIL_ADDRESS, PASSWORD } = req.body;

    // 2. Find user by email
    const user = await prisma.user.findUnique({
      where: { email: EMAIL_ADDRESS },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials. Please check your EMAIL_ADDRESS and PASSWORD.",
      });
    }

    // 3. Compare the provided password with the stored hashed password
    const isPasswordValid = await bcrypt.compare(PASSWORD, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials. Please check your EMAIL_ADDRESS and PASSWORD.",
      });
    }

    // 4. Generate JWT token containing id and role
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" } // Token valid for 7 days
    );

    // 5. Send back user info (no password) + token
    return res.status(200).json({
      success: true,
      message: "Login successful!",
      token,
      user: {
        id: user.id,
        name: user.fullName,
        role: user.role, // STUDENT | TRAINER — frontend uses this for redirection
      },
    });
  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Please try again.",
    });
  }
};

module.exports = { registerUser, loginUser };
