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

// ─── SMS Delivery ─────────────────────────────────────────────────────────────

/**
 * sendSmsOTP
 * Sends a 6-digit OTP to `phone` via Fast2SMS Quick-SMS API.
 * When SMS_MOCK_MODE=true the real API is skipped and the OTP is logged.
 *
 * @param {string} phone  - 10-digit Indian mobile number (no country code)
 * @param {string} otp    - 6-digit OTP string
 * @returns {Promise<void>}
 */
const sendSmsOTP = async (phone, otp) => {
  // ── Mock mode: bypass real API call in development / QA ──────────────────
  if (process.env.SMS_MOCK_MODE === "true") {
    console.log(`[MOCK SMS] OTP for ${phone} is: ${otp}`);
    return; // Treat as success
  }

  // ── Production: hit the Fast2SMS Quick-SMS API ────────────────────────────
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "FAST2SMS_API_KEY is not set. Add it to .env or enable SMS_MOCK_MODE=true."
    );
  }

  // Read route from .env — defaults to 'q' (Quick SMS, no DLT needed)
  const smsRoute = process.env.FAST2SMS_ROUTE || "q";

  try {
    const payload = {
      route: smsRoute,
      message: `Your LurnStack OTP is: ${otp}. Valid for 5 minutes. Do not share it with anyone.`,
      language: "english",
      flash: 0,
      numbers: phone,
    };

    console.log(`[SMS] Sending via Fast2SMS | Route: ${smsRoute} | To: ${phone}`);

    const response = await axios.post(
      "https://www.fast2sms.com/dev/bulkV2",
      payload,
      {
        headers: {
          authorization: apiKey,
          "Content-Type": "application/json",
        },
        timeout: 10000, // 10-second timeout
      }
    );

    // Log the full Fast2SMS response so you can debug easily
    console.log("[SMS] Fast2SMS raw response:", JSON.stringify(response.data));

    if (!response.data?.return) {
      throw new Error(
        `Fast2SMS rejected the request: ${JSON.stringify(response.data)}`
      );
    }

    console.log(`[SMS] ✅ OTP delivered successfully to ${phone}`);
  } catch (error) {
    // Log the full error including Fast2SMS error body if available
    const f2sError = error.response?.data;
    console.error("[SMS] ❌ Delivery failed:", error.message);
    if (f2sError) console.error("[SMS] Fast2SMS error details:", JSON.stringify(f2sError));
    throw new Error("Failed to send OTP via SMS. Please try again.");
  }
};

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

  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,        // e.g. smtp.gmail.com
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_PORT === "465", // true only for port 465 (SSL)
    auth: {
      user: process.env.SMTP_USER,      // your email address
      pass: process.env.SMTP_PASS,      // app password / API key
    },
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
    text: `Your LurnStack OTP is: ${otp}\n\nThis code expires in 5 minutes. Do not share it with anyone.`,
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
                    <img src="https://api.lurnstack.com/uploads/logo.png" alt="LurnStack Logo" width="100"
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
                      <strong style="color:#0f172a;">5 minutes</strong>.
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

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { generateOTP, sendSmsOTP, sendEmailOTP };
