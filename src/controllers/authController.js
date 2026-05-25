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
    const { FULL_NAME, EMAIL_ADDRESS, PASSWORD, PHONE_NUMBER, role } = req.body;

    // 2. Validation — ensure all required fields are present
    if (!FULL_NAME || !EMAIL_ADDRESS || !PASSWORD) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields: FULL_NAME, EMAIL_ADDRESS, and PASSWORD.",
      });
    }

    // 3. Normalize values
    const email = String(EMAIL_ADDRESS || "").trim().toLowerCase();
    const phone = PHONE_NUMBER ? String(PHONE_NUMBER).trim() : null;

    // 4. Resolve role — accept 'TRAINER' from UI toggle; default everything else to STUDENT
    const userRole = role === "TRAINER" ? "TRAINER" : "STUDENT";

    // 5. Duplicate check — make sure the email is not already registered
    const existingEmail = await prisma.user.findUnique({
      where: { email },
    });

    if (existingEmail) {
      return res.status(409).json({
        success: false,
        message: "Email address is already registered.",
      });
    }

    // 6. Duplicate check — make sure the phone number is not already registered
    if (phone) {
      const existingPhone = await prisma.user.findUnique({
        where: { phoneNumber: phone },
      });

      if (existingPhone) {
        return res.status(409).json({
          success: false,
          message: "Mobile number is already registered.",
        });
      }
    }

    // 7. Security — hash the password before saving (salt rounds: 12)
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(PASSWORD, salt);

    // 8. Create the new user record in the database
    const newUser = await prisma.user.create({
      data: {
        fullName: FULL_NAME,
        email: email,
        password: hashedPassword,
        phoneNumber: phone,
        role: userRole, // Enum: STUDENT | TRAINER
      },
    });

    // 9. Return user data excluding password with 201 Created status
    const { password: _pw, ...userWithoutPassword } = newUser;

    return res.status(201).json({
      success: true,
      message: "Account created successfully!",
      user: userWithoutPassword,
    });
  } catch (error) {
    console.error("Register Error:", error);

    // Handle database unique constraint violation errors nicely
    if (error.code === "P2002") {
      const targets = error.meta?.target || [];
      if (targets.includes("email")) {
        return res.status(409).json({
          success: false,
          message: "Email address is already registered.",
        });
      }
      if (targets.includes("phoneNumber")) {
        return res.status(409).json({
          success: false,
          message: "Mobile number is already registered.",
        });
      }
      return res.status(409).json({
        success: false,
        message: "Email address or mobile number is already registered.",
      });
    }

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

// ─────────────────────────────────────────────
// @desc    Generate & send a 6-digit OTP
// @route   POST /api/auth/send-otp
// @access  Public
// ─────────────────────────────────────────────
const { generateOTP, sendSmsOTP, sendEmailOTP } = require("../services/otpService");

const sendOTP = async (req, res) => {
  try {
    // 1. Accept either an email or a phone number as the identifier
    const { identifier, type } = req.body;
    //    type: "email" | "sms"  (defaults to "email" if omitted)

    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: "Please provide an identifier (email or phone number).",
      });
    }

    const deliveryType = type === "sms" ? "sms" : "email";
    let normalizedIdentifier = String(identifier).trim();

    // 2. Prevent OTP waste: check duplicate checks before delivery
    if (deliveryType === "email") {
      normalizedIdentifier = normalizedIdentifier.toLowerCase();
      
      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedIdentifier },
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: "Email address is already registered.",
        });
      }
    } else {
      const existingUser = await prisma.user.findUnique({
        where: { phoneNumber: normalizedIdentifier },
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: "Mobile number is already registered.",
        });
      }
    }

    // 3. Generate OTP and calculate a 5-minute expiry window
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // now + 5 min

    // 4. Deliver the OTP via the requested channel
    if (deliveryType === "sms") {
      await sendSmsOTP(normalizedIdentifier, otp);
    } else {
      await sendEmailOTP(normalizedIdentifier, otp);
    }

    // 5. Persist the OTP record (upsert to avoid duplicate entries per identifier)
    //    Delete any previous OTP for the same identifier first to keep the table lean.
    await prisma.oTPVerification.deleteMany({
      where: { identifier: normalizedIdentifier },
    });

    await prisma.oTPVerification.create({
      data: {
        identifier: normalizedIdentifier,
        code: otp,
        expiresAt,
      },
    });

    return res.status(200).json({
      success: true,
      message: `OTP sent successfully via ${deliveryType.toUpperCase()}.`,
      // Expose expiresAt so the client can show a countdown
      expiresAt,
    });
  } catch (error) {
    console.error("sendOTP Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to send OTP. Please try again.",
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Verify the submitted OTP code
// @route   POST /api/auth/verify-otp
// @access  Public
// ─────────────────────────────────────────────
const verifyOTP = async (req, res) => {
  try {
    const { identifier, code } = req.body;

    if (!identifier || !code) {
      return res.status(400).json({
        success: false,
        message: "Please provide both identifier and code.",
      });
    }

    const trimmed = String(identifier).trim();
    const normalizedIdentifier = trimmed.includes("@") ? trimmed.toLowerCase() : trimmed;

    // 1. Look up the most recent OTP record for this identifier
    const otpRecord = await prisma.oTPVerification.findFirst({
      where: { identifier: normalizedIdentifier },
      orderBy: { createdAt: "desc" }, // always validate against the latest one
    });

    // 2. No record found — either never sent or already consumed
    if (!otpRecord) {
      return res.status(404).json({
        success: false,
        message: "No OTP found for this identifier. Please request a new one.",
      });
    }

    // 3. Check expiry
    if (new Date() > otpRecord.expiresAt) {
      // Clean up the stale record
      await prisma.oTPVerification.delete({ where: { id: otpRecord.id } });
      return res.status(410).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    // 4. Validate the code
    if (otpRecord.code !== code.trim()) {
      return res.status(401).json({
        success: false,
        message: "Invalid OTP. Please check the code and try again.",
      });
    }

    // 5. OTP is valid — delete it to prevent replay attacks
    await prisma.oTPVerification.delete({ where: { id: otpRecord.id } });

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully!",
    });
  } catch (error) {
    console.error("verifyOTP Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Please try again.",
      error: error.message,
    });
  }
};

module.exports = { registerUser, loginUser, sendOTP, verifyOTP };
