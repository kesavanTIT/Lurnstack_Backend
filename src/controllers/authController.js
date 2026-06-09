const prisma = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { normalizePhone } = require("../utils/phone");
const axios = require("axios");

// ─────────────────────────────────────────────
// @desc    Register a new user (STUDENT or TRAINER)
// @route   POST /api/auth/register
// @access  Public
// ─────────────────────────────────────────────
const registerUser = async (req, res) => {
  try {
    // 1. Extract fields from request body
    //    Accept both FULL_NAME/EMAIL_ADDRESS/PASSWORD (UI convention) and
    //    fullName/email/password (REST convention) to avoid crashes on field name mismatch.
    const fullNameRaw = req.body.FULL_NAME || req.body.fullName || req.body.name;
    const emailRaw = req.body.EMAIL_ADDRESS || req.body.email;
    const passwordRaw = req.body.PASSWORD || req.body.password;
    const { PHONE_NUMBER, phoneNumber, role } = req.body;
    const phoneRaw = PHONE_NUMBER || phoneNumber;

    // 2. Validation — ensure all required fields are present
    if (!fullNameRaw || !emailRaw || !passwordRaw) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields: FULL_NAME (or fullName), EMAIL_ADDRESS (or email), and PASSWORD (or password).",
      });
    }

    // 3. Normalize values
    const email = String(emailRaw).trim().toLowerCase();
    const FULL_NAME = String(fullNameRaw).trim();
    const PASSWORD = String(passwordRaw);
    const phone = phoneRaw ? String(phoneRaw).trim() : null;
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
    // 1. Accept both EMAIL_ADDRESS (UI convention) and email (REST convention)
    //    to avoid a Prisma crash when the field name doesn't match.
    const emailRaw = req.body.EMAIL_ADDRESS || req.body.email;
    const passwordRaw = req.body.PASSWORD || req.body.password;

    // 1a. Validate that email and password were actually provided
    if (!emailRaw || !passwordRaw) {
      return res.status(400).json({
        success: false,
        message: "Please provide EMAIL_ADDRESS (or email) and PASSWORD (or password).",
      });
    }

    const emailNormalized = String(emailRaw).trim().toLowerCase();

    // 2. Find user by email — safe: emailNormalized is always a non-empty string here
    const user = await prisma.user.findUnique({
      where: { email: emailNormalized },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials. Please check your EMAIL_ADDRESS and PASSWORD.",
      });
    }

    // 3. Compare the provided password with the stored hashed password
    const isPasswordValid = await bcrypt.compare(String(passwordRaw), user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials. Please check your EMAIL_ADDRESS and PASSWORD.",
      });
    }

    // Check request role parameter
    const reqRole = req.body.role || req.body.ROLE || req.body.userRole;
    const isRequestingTrainer = reqRole && String(reqRole).toUpperCase() === "TRAINER";

    // If payload contains role/ROLE/userRole = "TRAINER", authenticate against trainer account.
    // Also, do not return a student/admin token for an email that is active as a trainer.
    if (isRequestingTrainer) {
      if (user.role !== "TRAINER") {
        return res.status(403).json({
          success: false,
          message: "Access denied. Logged-in user is not a trainer.",
        });
      }
    }

    // Determine final role to use in token and response.
    // If the database role is TRAINER, ensure the output role is lowercase "trainer".
    let finalRole = user.role;
    if (user.role === "TRAINER") {
      finalRole = "trainer";
    }

    // 4. Generate JWT token containing id and role
    const token = jwt.sign(
      { id: user.id, role: finalRole },
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
        role: finalRole, // STUDENT | trainer | ADMIN — frontend uses this for redirection
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
const { generateOTP, sendEmailOTP, sendPasswordResetEmail } = require("../services/otpService");

const sendOTP = async (req, res) => {
  try {
    // 1. Accept an email as the identifier (SMS flow has been removed)
    const { identifier, type } = req.body;
    //    type: "email" (defaults to "email" if omitted)

    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: "Please provide an identifier (email address).",
      });
    }

    // Reject SMS requests or identifiers that do not look like email addresses
    if (type === "sms" || !String(identifier).includes("@")) {
      return res.status(400).json({
        success: false,
        message: "SMS OTP delivery is not supported. Please use email verification.",
      });
    }

    const deliveryType = "email";
    let normalizedIdentifier = String(identifier).trim().toLowerCase();

    // 2. Prevent OTP waste: check duplicate checks before delivery
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedIdentifier },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email address is already registered.",
      });
    }

    // 3. Generate OTP and calculate a 1-minute expiry window
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 1 * 60 * 1000); // now + 1 min

    // 4. Deliver the OTP via the requested channel
    await sendEmailOTP(normalizedIdentifier, otp);

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
  const { EMAIL_ADDRESS, email: rawEmail } = req.body;
  const identifier = EMAIL_ADDRESS || rawEmail;

  console.log(`[Forgot Password] Request received. Identifier: ${identifier}`);

  try {
    // 1. Validate input
    if (!identifier) {
      console.log("[Forgot Password] Validation failed: Email address is required.");
      return res.status(400).json({
        success: false,
        message: "Email address is required.",
      });
    }

    const email = String(identifier).trim().toLowerCase();

    // 2. Look up the user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // 3. SECURITY: Always return success message even if user does not exist to prevent user enumeration
    if (!user) {
      console.log(`[Forgot Password] User not found for email: ${email}. Returning success for security.`);
      return res.status(200).json({
        success: true,
        message: "If the email exists, a reset link has been sent.",
      });
    }

    // 4. Generate a secure random reset token
    const rawToken = crypto.randomBytes(32).toString("hex");
    console.log(`[Forgot Password] Secure token generated for user ID: ${user.id}`);

    // 5. Hash the token before saving to database
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    console.log("[Forgot Password] Token hashed successfully.");

    // 6. Set expiry — 30 minutes from now
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    // 7. Delete any previous unused reset tokens for this user (keep DB clean)
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    // 8. Save the new token hash in the database
    await prisma.passwordResetToken.create({
      data: {
        token: tokenHash,
        userId: user.id,
        expiresAt,
      },
    });
    console.log("[Forgot Password] Token hash and expiry saved to DB.");

    // 9. Send password reset email using ZeptoMail
    console.log(`[Forgot Password] Mail send start to ${email}`);
    try {
      await sendPasswordResetEmail(user.email, rawToken);
      console.log(`[Forgot Password] Mail send success to ${email}`);
    } catch (mailErr) {
      console.error(`[Forgot Password] Failed to send email to ${email}:`, mailErr.message);
      return res.status(500).json({
        success: false,
        message: `Failed to send password reset email: ${mailErr.message}`,
      });
    }

    console.log(`[Forgot Password] Success response sent to ${email}`);
    return res.status(200).json({
      success: true,
      message: "Password reset link sent.",
    });
  } catch (error) {
    console.error("[Forgot Password] Error:", error);
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
    const { token, newPassword, PASSWORD } = req.body;
    const password = newPassword || PASSWORD;

    console.log(`[Reset Password] Request received. Token provided: ${token ? "Yes" : "No"}`);

    // 1. Validate inputs
    if (!token) {
      console.log("[Reset Password] Validation failed: token is missing.");
      return res.status(400).json({
        success: false,
        message: "Reset link is invalid or expired.",
      });
    }

    if (!password) {
      console.log("[Reset Password] Validation failed: password is missing.");
      return res.status(400).json({
        success: false,
        message: "Reset link is invalid or expired.",
      });
    }

    // 2. Enforce password policy (matching frontend signup: 8+ chars, uppercase, lowercase, number, special char)
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (!passwordRegex.test(password)) {
      console.log("[Reset Password] Validation failed: password does not meet complexity requirements.");
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.",
      });
    }

    // 3. Hash the incoming token
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // 4. Look up the token in the database by its hash
    const resetRecord = await prisma.passwordResetToken.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    });

    // 5. If token doesn't exist, it's invalid
    if (!resetRecord) {
      console.log("[Reset Password] Token hash not found in database.");
      return res.status(400).json({
        success: false,
        message: "Reset link is invalid or expired.",
      });
    }

    // 6. Check if token has expired
    if (new Date() > resetRecord.expiresAt) {
      console.log("[Reset Password] Token has expired. Deleting stale token.");
      // Clean up the expired token
      await prisma.passwordResetToken.delete({ where: { id: resetRecord.id } });
      return res.status(410).json({
        success: false,
        message: "Reset link is invalid or expired.",
      });
    }

    // 7. Hash the new password (salt rounds: 12, matching your registration logic)
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 8. Atomically: update password AND delete all reset tokens for this user
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
    console.log(`[Reset Password] Password reset successful for user ID: ${resetRecord.userId}`);

    return res.status(200).json({
      success: true,
      message: "Password reset successful.",
    });
  } catch (error) {
    console.error("[Reset Password] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Please try again.",
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Initiate Google OAuth flow
// @route   GET /api/auth/google
// @access  Public
// ─────────────────────────────────────────────
const initiateGoogleAuth = async (req, res) => {
  try {
    const frontendRedirect = req.query.redirect;
    if (!frontendRedirect) {
      return res.status(400).json({
        success: false,
        message: "redirect parameter (frontend login URL) is required."
      });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const callbackUrl = process.env.GOOGLE_CALLBACK_URL || `${req.protocol}://${req.get("host")}/api/auth/google/callback`;

    if (!clientId || !clientSecret) {
      const errorUrl = new URL(frontendRedirect);
      errorUrl.searchParams.set("error", "Google login is not configured on the server.");
      return res.redirect(errorUrl.toString());
    }

    const state = Buffer.from(frontendRedirect).toString("base64");
    const scope = "openid email profile";

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}` +
      `&prompt=select_account`;

    return res.redirect(googleAuthUrl);
  } catch (error) {
    console.error("Google Auth Init Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error starting Google Auth flow."
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Google OAuth Callback
// @route   GET /api/auth/google/callback
// @access  Public
// ─────────────────────────────────────────────
const googleAuthCallback = async (req, res) => {
  let frontendRedirectUrl = process.env.FRONTEND_URL || "http://localhost:3000/login";
  try {
    const { code, state, error: googleError } = req.query;

    if (state) {
      try {
        frontendRedirectUrl = Buffer.from(state, "base64").toString("utf-8");
      } catch (e) {
        console.error("Failed to decode state:", e.message);
      }
    }

    if (googleError) {
      const redirectUrl = new URL(frontendRedirectUrl);
      redirectUrl.searchParams.set("error", `Google authentication failed: ${googleError}`);
      return res.redirect(redirectUrl.toString());
    }

    if (!code) {
      const redirectUrl = new URL(frontendRedirectUrl);
      redirectUrl.searchParams.set("error", "No authorization code returned from Google.");
      return res.redirect(redirectUrl.toString());
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const callbackUrl = process.env.GOOGLE_CALLBACK_URL || `${req.protocol}://${req.get("host")}/api/auth/google/callback`;

    if (!clientId || !clientSecret) {
      const redirectUrl = new URL(frontendRedirectUrl);
      redirectUrl.searchParams.set("error", "Google login is not configured on the server.");
      return res.redirect(redirectUrl.toString());
    }

    let tokenResponse;
    try {
      tokenResponse = await axios.post("https://oauth2.googleapis.com/token", {
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code"
      });
    } catch (tokenErr) {
      console.error("Token exchange failed:", tokenErr.response?.data || tokenErr.message);
      const redirectUrl = new URL(frontendRedirectUrl);
      redirectUrl.searchParams.set("error", "Failed to exchange authorization code for tokens.");
      return res.redirect(redirectUrl.toString());
    }

    const { access_token } = tokenResponse.data;

    let userInfoResponse;
    try {
      userInfoResponse = await axios.get("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${access_token}` }
      });
    } catch (userErr) {
      console.error("Userinfo fetch failed:", userErr.response?.data || userErr.message);
      const redirectUrl = new URL(frontendRedirectUrl);
      redirectUrl.searchParams.set("error", "Failed to retrieve user info from Google.");
      return res.redirect(redirectUrl.toString());
    }

    const { name, email: rawEmail } = userInfoResponse.data;
    if (!rawEmail) {
      const redirectUrl = new URL(frontendRedirectUrl);
      redirectUrl.searchParams.set("error", "Google profile did not contain a valid email address.");
      return res.redirect(redirectUrl.toString());
    }

    const email = rawEmail.trim().toLowerCase();

    let user = await prisma.user.findUnique({
      where: { email }
    });

    if (user) {
      if (!user.isActive) {
        const redirectUrl = new URL(frontendRedirectUrl);
        redirectUrl.searchParams.set("error", "This account has been deactivated. Please contact support.");
        return res.redirect(redirectUrl.toString());
      }
    } else {
      const randomPassword = crypto.randomBytes(16).toString("hex");
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(randomPassword, salt);

      user = await prisma.user.create({
        data: {
          fullName: name || "Google User",
          email,
          password: hashedPassword,
          role: "STUDENT"
        }
      });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const redirectUrl = new URL(frontendRedirectUrl);
    redirectUrl.searchParams.set("token", token);
    return res.redirect(redirectUrl.toString());
  } catch (error) {
    console.error("Google Auth Callback Exception:", error);
    try {
      const redirectUrl = new URL(frontendRedirectUrl);
      redirectUrl.searchParams.set("error", "An unexpected error occurred during Google authentication.");
      return res.redirect(redirectUrl.toString());
    } catch (urlErr) {
      return res.status(500).json({
        success: false,
        message: "An unexpected error occurred and redirection failed."
      });
    }
  }
};

// ─────────────────────────────────────────────
// @desc    Get current logged-in user profile
// @route   GET /api/auth/me
// @access  Private
// ─────────────────────────────────────────────
const getMe = async (req, res) => {
  try {
    const userId = parseInt(req.user.id);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User profile not found.",
      });
    }

    // Map role for frontend lowercase consistency if role is TRAINER
    const formattedRole = user.role === "TRAINER" ? "trainer" : user.role;

    const profileData = {
      id: user.id,
      name: user.fullName,
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: formattedRole,
      isActive: user.isActive,
      createdAt: user.createdAt,
    };

    return res.status(200).json({
      success: true,
      user: profileData,
      data: profileData,
    });
  } catch (error) {
    console.error("Get Me Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Update current logged-in user profile details
// @route   PUT /api/auth/profile
// @access  Private
// ─────────────────────────────────────────────
const updateProfile = async (req, res) => {
  try {
    const userId = parseInt(req.user.id);
    const { fullName, email, phoneNumber } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const updateData = {};

    // 1. Validate & Update fullName
    if (fullName !== undefined) {
      const trimmedName = String(fullName || "").trim();
      if (!trimmedName) {
        return res.status(400).json({
          success: false,
          message: "Full Name cannot be empty.",
        });
      }
      updateData.fullName = trimmedName;
    }

    // 2. Validate & Update email
    if (email !== undefined) {
      const trimmedEmail = String(email || "").trim().toLowerCase();
      if (!trimmedEmail || !trimmedEmail.includes("@")) {
        return res.status(400).json({
          success: false,
          message: "A valid Email Address is required.",
        });
      }

      if (trimmedEmail !== user.email) {
        // Check duplicate email
        const emailExists = await prisma.user.findUnique({
          where: { email: trimmedEmail },
        });
        if (emailExists) {
          return res.status(409).json({
            success: false,
            message: "Email address is already registered.",
          });
        }
        updateData.email = trimmedEmail;
      }
    }

    // 3. Validate & Update phoneNumber
    if (phoneNumber !== undefined) {
      const trimmedPhone = String(phoneNumber || "").trim();
      if (!trimmedPhone) {
        updateData.phoneNumber = null;
        updateData.phoneNormalized = null;
      } else {
        const phoneNormalized = normalizePhone(trimmedPhone);
        if (phoneNormalized !== user.phoneNormalized) {
          // Check duplicate phone number
          const localNumber = phoneNormalized.length >= 10 ? phoneNormalized.slice(-10) : phoneNormalized;
          const phoneExists = await prisma.user.findFirst({
            where: {
              id: { not: userId },
              OR: [
                { phoneNormalized: phoneNormalized },
                { phoneNormalized: { endsWith: localNumber } },
                { phoneNumber: { endsWith: localNumber } },
              ],
            },
          });
          if (phoneExists) {
            return res.status(409).json({
              success: false,
              message: "Mobile number is already registered.",
            });
          }
          updateData.phoneNumber = trimmedPhone;
          updateData.phoneNormalized = phoneNormalized;
        }
      }
    }

    // Perform database update
    let updatedUser = user;
    if (Object.keys(updateData).length > 0) {
      updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateData,
      });
    }

    // Format profile output
    const formattedRole = updatedUser.role === "TRAINER" ? "trainer" : updatedUser.role;
    const profileData = {
      id: updatedUser.id,
      fullName: updatedUser.fullName,
      email: updatedUser.email,
      phoneNumber: updatedUser.phoneNumber,
      role: formattedRole,
      isActive: updatedUser.isActive,
      createdAt: updatedUser.createdAt,
    };

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully!",
      user: profileData,
      data: profileData,
    });
  } catch (error) {
    console.error("Update Profile Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error updating profile.",
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Self-service account deletion (Soft Delete)
// @route   DELETE /api/auth/profile
// @access  Private
// ─────────────────────────────────────────────
const deleteAccount = async (req, res) => {
  try {
    const userId = parseInt(req.user.id);

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Soft delete: deactivate, release email and phone constraints
    const timestamp = Date.now();
    const deletedEmail = `deleted-${userId}-${timestamp}-${user.email}`;

    await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        email: deletedEmail,
        phoneNumber: null,
        phoneNormalized: null,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Your account has been deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Account Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error deleting account.",
    });
  }
};

module.exports = {
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
};
