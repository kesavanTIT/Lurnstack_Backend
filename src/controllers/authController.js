const prisma = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { normalizePhone } = require("../utils/phone");

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
    const phoneNormalized = phone ? normalizePhone(phone) : null;

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
    if (phoneNormalized) {
      const localNumber = phoneNormalized.length >= 10 ? phoneNormalized.slice(-10) : phoneNormalized;
      const existingPhone = await prisma.user.findFirst({
        where: {
          OR: [
            { phoneNormalized: phoneNormalized },
            { phoneNormalized: { endsWith: localNumber } },
            { phoneNumber: { endsWith: localNumber } },
          ],
        },
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
        phoneNormalized: phoneNormalized,
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
      if (targets.includes("phoneNumber") || targets.includes("phoneNormalized")) {
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
const { generateOTP, sendSmsOTP, sendEmailOTP, sendPasswordResetEmail } = require("../services/otpService");

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
      normalizedIdentifier = normalizePhone(normalizedIdentifier);
      const localNumber = normalizedIdentifier.length >= 10 ? normalizedIdentifier.slice(-10) : normalizedIdentifier;

      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { phoneNormalized: normalizedIdentifier },
            { phoneNormalized: { endsWith: localNumber } },
            { phoneNumber: { endsWith: localNumber } },
          ],
        },
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
      const smsPhone = normalizedIdentifier.length >= 10 ? normalizedIdentifier.slice(-10) : normalizedIdentifier;
      await sendSmsOTP(smsPhone, otp);
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
    const normalizedIdentifier = trimmed.includes("@") 
      ? trimmed.toLowerCase() 
      : normalizePhone(trimmed);

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

// ─────────────────────────────────────────────
// @desc    Request a password reset link via email
// @route   POST /api/auth/forgot-password
// @body    { EMAIL_ADDRESS: string }
// @access  Public
// ─────────────────────────────────────────────
const forgotPassword = async (req, res) => {
  try {
    const { EMAIL_ADDRESS } = req.body;

    // 1. Validate input
    if (!EMAIL_ADDRESS) {
      return res.status(400).json({
        success: false,
        message: "Please provide your email address.",
      });
    }

    const email = String(EMAIL_ADDRESS).trim().toLowerCase();

    // 2. Look up the user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // 3. SECURITY: Always return the same message whether user exists or not.
    //    This prevents attackers from discovering which emails are registered
    //    (called "user enumeration attack" prevention).
    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If that email exists in our system, a password reset link has been sent.",
      });
    }

    // 4. Generate a cryptographically secure 64-character hex token
    const token = crypto.randomBytes(32).toString("hex");

    // 5. Set expiry — 15 minutes from now
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // 6. Delete any previous unused reset tokens for this user (keep DB clean)
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    // 7. Save the new token in the database
    await prisma.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    // 8. Send the styled HTML reset email via Zeptomail SMTP
    await sendPasswordResetEmail(user.email, token);

    return res.status(200).json({
      success: true,
      message: "If that email exists in our system, a password reset link has been sent.",
    });
  } catch (error) {
    console.error("Forgot Password Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Please try again.",
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Verify reset token & set new password
// @route   POST /api/auth/reset-password
// @body    { token: string, newPassword: string }
// @access  Public
// ─────────────────────────────────────────────
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    // 1. Validate inputs
    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Token and new password are required.",
      });
    }

    // 2. Enforce minimum password strength (matches your existing registration rule)
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long.",
      });
    }

    // 3. Look up the token in the database
    const resetRecord = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    // 4. If token doesn't exist, it's invalid
    if (!resetRecord) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset link. Please request a new one.",
      });
    }

    // 5. Check if token has expired
    if (new Date() > resetRecord.expiresAt) {
      // Clean up the expired token
      await prisma.passwordResetToken.delete({ where: { id: resetRecord.id } });
      return res.status(400).json({
        success: false,
        message: "This reset link has expired (15 minutes). Please request a new one.",
      });
    }

    // 6. Hash the new password (salt rounds: 12, matching your registration logic)
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // 7. Atomically: update password AND delete all reset tokens for this user
    //    Using prisma.$transaction ensures both happen together or not at all.
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetRecord.userId },
        data: { password: hashedPassword },
      }),
      prisma.passwordResetToken.deleteMany({
        where: { userId: resetRecord.userId },
      }),
    ]);

    return res.status(200).json({
      success: true,
      message: "Your password has been reset successfully! You can now log in with your new password.",
    });
  } catch (error) {
    console.error("Reset Password Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Please try again.",
    });
  }
};

module.exports = { registerUser, loginUser, sendOTP, verifyOTP, forgotPassword, resetPassword };
