/**
 * otpService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles the *delivery* side of OTP verification.
 *
 * SMS  → Fast2SMS Quick-SMS API
 *         Set SMS_MOCK_MODE=true in .env to skip real API calls during dev/QA.
 *
 * Email → Nodemailer SMTP transporter
 *         Configure SMTP_* variables in .env (Gmail, Mailgun, Resend, etc.)
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const axios = require("axios");
const nodemailer = require("nodemailer");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generates a cryptographically adequate 6-digit OTP.
 * Math.random() is fine for non-security-critical codes; swap with
 * `crypto.randomInt(100000, 999999)` if you need stronger randomness.
 */
const generateOTP = () => {
  return String(Math.floor(100000 + Math.random() * 900000));
};

// ─── SMS Delivery (Removed) ───────────────────────────────────────────────────

// ─── Email Delivery ───────────────────────────────────────────────────────────


/**
 * Lazily creates and caches a Nodemailer transporter.
 * Required env variables:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 *   SMTP_FROM  (optional — defaults to SMTP_USER)
 */
let _transporter = null;
const getTransporter = () => {
  if (_transporter) return _transporter;

  // Log SMTP config on first use (never log the full password)
  console.log("[SMTP] Creating transporter with:", {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_PORT === "465",
    user: process.env.SMTP_USER,
    from: process.env.SMTP_FROM,
    passLength: process.env.SMTP_PASS ? process.env.SMTP_PASS.length : 0,
  });

  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,        // smtp.zeptomail.in
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_PORT === "465", // true only for port 465 (SSL)
    auth: {
      user: process.env.SMTP_USER,      // emailapikey
      pass: process.env.SMTP_PASS,      // Zeptomail API key
    },
    // Increase timeout for Zeptomail
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  return _transporter;
};

/**
 * sendEmailOTP
 * Sends a styled OTP email to `email`.
 *
 * @param {string} email - Recipient email address
 * @param {string} otp   - 6-digit OTP string
 * @returns {Promise<void>}
 */
const sendEmailOTP = async (email, otp) => {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  if (!from) {
    throw new Error(
      "SMTP_FROM / SMTP_USER is not set. Configure your SMTP credentials in .env."
    );
  }

  const transporter = getTransporter();

  const mailOptions = {
    from: `"LurnStack" <${from}>`,
    to: email,
    subject: "Your LurnStack Verification Code",
    // Plain-text fallback
    text: `Your LurnStack OTP is: ${otp}\n\nThis code expires in 1 minute. Do not share it with anyone.`,
    // HTML email body
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>LurnStack OTP</title>
      </head>
      <body style="margin:0;padding:0;background:#ffffff;font-family:'Helvetica Neue',Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="padding:40px 20px;">
              <table width="480" cellpadding="0" cellspacing="0"
                style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
                <!-- Header -->
                <tr>
                  <td align="center"
                    style="background:#ffffff;padding:40px 40px 10px;border-bottom:1px solid #f1f5f9;">
                    <img src="https://api.lurnstack.com/uploads/logo.png" alt="LurnStack Logo" width="130"
                      style="display:block;margin:0 auto 12px;" />
                    <p style="margin:4px 0 0;color:#64748b;font-size:14px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">
                      Verification Code
                    </p>
                  </td>
                </tr>
                <!-- Body -->
                <tr>
                  <td style="padding:40px;">
                    <p style="margin:0 0 24px;color:#334155;font-size:16px;line-height:1.6;">
                      Use the code below to verify your identity. It expires in
                      <strong style="color:#0f172a;">1 minute</strong>.
                    </p>
                    <!-- OTP box -->
                    <div style="text-align:center;margin:32px 0;">
                      <span style="display:inline-block;background:#f8fafc;border:2px dashed #cbd5e1;
                        border-radius:12px;padding:20px 48px;font-size:36px;font-weight:800;
                        letter-spacing:12px;color:#0f172a;">
                        ${otp}
                      </span>
                    </div>
                    <p style="margin:0 0 8px;color:#64748b;font-size:13px;line-height:1.5;">
                      ⚠️ Never share this code with anyone. LurnStack will never ask for it.
                    </p>
                    <p style="margin:0;color:#64748b;font-size:13px;line-height:1.5;">
                      If you didn't request this code, you can safely ignore this email.
                    </p>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td align="center" style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;">
                    <p style="margin:0;color:#94a3b8;font-size:12px;">
                      © ${new Date().getFullYear()} LurnStack. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[EMAIL] OTP sent successfully to ${email}`);
  } catch (error) {
    console.error("[EMAIL] Delivery failed:", error.message);
    throw new Error("Failed to send OTP via Email. Please try again.");
  }
};

// ─── Password Reset Email Delivery ───────────────────────────────────────────

/**
 * sendPasswordResetEmail
 * Sends a professional password reset email to `email` containing a secure link.
 * Uses Zeptomail SMTP configured via SMTP_* env variables.
 *
 * @param {string} email  - Recipient email address
 * @param {string} token  - Cryptographically secure reset token (64-char hex)
 * @returns {Promise<void>}
 */
const sendPasswordResetEmail = async (email, token) => {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  if (!from) {
    throw new Error(
      "SMTP_FROM / SMTP_USER is not set. Configure your SMTP credentials in .env."
    );
  }

  const frontendUrl = process.env.FRONTEND_URL || "https://lurnstack.com";
  const resetLink = `${frontendUrl}/reset-password?token=${token}`;

  const transporter = getTransporter();

  const mailOptions = {
    from: `"LurnStack" <${from}>`,
    to: email,
    subject: "Reset your LurnStack password",
    // Plain-text fallback
    text: `We received a request to reset your LurnStack password.\n\nClick the link below to reset your password:\n${resetLink}\n\nThis link is valid for 30 minutes. If you did not request this, please ignore this email.`,
    // Styled HTML body
    html: `
<!doctype html>
<html>
  <body style="margin:0;background:#f6faf7;font-family:Arial,sans-serif;color:#102018;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6faf7;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dcebe2;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="background:#004d3d;padding:24px;text-align:center;color:#ffffff;">
                <div style="font-size:24px;font-weight:800;">LurnStack</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px;">
                <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#004d3d;">Reset your password</h1>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#475569;">
                  We received a request to reset your LurnStack password. Click the button below to choose a new password.
                </p>
                <p style="margin:28px 0;text-align:center;">
                  <a href="${resetLink}" style="display:inline-block;background:#004d3d;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 24px;border-radius:12px;">
                    Reset Password
                  </a>
                </p>
                <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#64748b;">
                  This link expires in 30 minutes. If you did not request this, you can safely ignore this email.
                </p>
                <p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#64748b;">
                  If the button does not work, copy and paste this URL into your browser:
                </p>
                <p style="word-break:break-all;margin:8px 0 0;font-size:12px;line-height:1.6;color:#004d3d;">
                  ${resetLink}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
    `,
  };

  try {
    // Verify SMTP connection before sending (5-second timeout)
    console.log("[EMAIL] Verifying SMTP connection to Zeptomail...");
    await Promise.race([
      transporter.verify(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("SMTP verification timeout")), 5000))
    ]);
    console.log("[EMAIL] ✅ SMTP connection verified successfully.");

    console.log(`[EMAIL] Attempting to send reset email to: ${email}`);
    // Send email with a promise race timeout of 10 seconds
    const info = await Promise.race([
      transporter.sendMail(mailOptions),
      new Promise((_, reject) => setTimeout(() => reject(new Error("ZeptoMail sending timeout")), 10000))
    ]);

    // Log the full Nodemailer response — this shows if Zeptomail accepted the email
    console.log("[EMAIL] ✅ Password reset email sent!");
    console.log("[EMAIL] Message ID:", info.messageId);
    console.log("[EMAIL] Accepted by server:", info.accepted);
    console.log("[EMAIL] Rejected by server:", info.rejected);
    console.log("[EMAIL] Server response:", info.response);
  } catch (error) {
    console.error("[EMAIL] ❌ Password reset delivery failed:");
    console.error("[EMAIL] Error code:", error.code);
    console.error("[EMAIL] Error message:", error.message);
    throw new Error(`Failed to send password reset email: ${error.message}`);
  }
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { generateOTP, sendEmailOTP, sendPasswordResetEmail };
