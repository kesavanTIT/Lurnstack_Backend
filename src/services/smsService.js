/**
 * smsService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * SMS delivery service for LurnStack session reminders.
 * Uses the Fast2SMS Bulk V2 API — the same provider used for OTP delivery.
 *
 * Exports:
 *   sendSessionReminderSMS(phoneNumbers, session, occurrence)
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const axios = require("axios");

// ─── Constants ────────────────────────────────────────────────────────────────

const FAST2SMS_URL   = "https://www.fast2sms.com/dev/bulkV2";
const SMS_BATCH_SIZE = 200; // Fast2SMS supports up to 1000 numbers per call; 200 is safe
const REQUEST_TIMEOUT_MS = 15000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Formats a Date object to a short, human-readable IST time string.
 * e.g. "10:30 AM IST"
 *
 * @param {Date|string} date
 * @returns {string}
 */
const formatISTTime = (date) => {
  return new Date(date).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour:     "2-digit",
    minute:   "2-digit",
    hour12:   true,
  }) + " IST";
};

/**
 * Normalizes a phone number to a 10-digit Indian mobile number.
 * Strips country code (+91 / 91) and all non-digit characters.
 * Returns null if the result is not exactly 10 digits.
 *
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
const normalizeToTenDigit = (raw) => {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");

  // Strip leading 91 country code if present (e.g. "919876543210" → "9876543210")
  const tenDigit = digits.length === 12 && digits.startsWith("91")
    ? digits.slice(2)
    : digits.length === 11 && digits.startsWith("0")
      ? digits.slice(1)
      : digits;

  return tenDigit.length === 10 ? tenDigit : null;
};

// ─── Session Reminder SMS ─────────────────────────────────────────────────────

/**
 * sendSessionReminderSMS
 * Sends a plain-text 10-minute reminder SMS to a list of phone numbers
 * via Fast2SMS Bulk V2 API.
 *
 * @param {string[]}  phoneNumbers  - Array of raw phone number strings (any format)
 * @param {object}    session       - LiveSession record (with trainer relation)
 * @param {object}    occurrence    - SessionOccurrence record
 * @returns {Promise<{ sent: number, failed: number, skipped: number }>}
 */
const sendSessionReminderSMS = async (phoneNumbers, session, occurrence) => {
  // ── Guard: mock mode ────────────────────────────────────────────────────
  if (process.env.SMS_MOCK_MODE === "true") {
    console.log(
      `[SMS-REMINDER] 🧪 MOCK MODE — would send SMS to ${phoneNumbers.length} number(s) for "${session.title}"`
    );
    return { sent: 0, failed: 0, skipped: phoneNumbers.length };
  }

  // ── Guard: API key ───────────────────────────────────────────────────────
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    throw new Error("FAST2SMS_API_KEY is not set in .env");
  }

  if (!phoneNumbers || phoneNumbers.length === 0) {
    console.log("[SMS-REMINDER] No phone numbers provided — skipping SMS send.");
    return { sent: 0, failed: 0, skipped: 0 };
  }

  // ── Normalise & de-duplicate numbers ────────────────────────────────────
  const validNumbers = [
    ...new Set(
      phoneNumbers
        .map(normalizeToTenDigit)
        .filter(Boolean)
    ),
  ];

  const skipped = phoneNumbers.length - validNumbers.length;

  if (validNumbers.length === 0) {
    console.log("[SMS-REMINDER] All numbers were invalid/missing — skipping SMS send.");
    return { sent: 0, failed: 0, skipped };
  }

  // ── Build the SMS message ────────────────────────────────────────────────
  const sessionTitle  = session.title   || "Live Session";
  const trainerName   = session.trainer?.fullName || "Your Trainer";
  const startTimeIST  = formatISTTime(occurrence.startsAt);
  const frontendUrl   = process.env.FRONTEND_URL || "https://lurnstack.com";
  const joinLink      = `${frontendUrl}/sessions/join/${occurrence.id}`;

  // ── IMPORTANT: Keep message  under 160 plain ASCII chars to avoid Unicode
  //   multi-part splitting (which can fail on DND numbers via Quick SMS route).
  //   Curly quotes and special chars trigger Unicode mode (70 chars/part).
  //   We intentionally omit the join link here to stay within 1 SMS.
  const message =
    `LurnStack: Your session ${sessionTitle} with ${trainerName} starts in 10 mins at ${startTimeIST}. Open the LurnStack app to join.`;

  const smsRoute = process.env.FAST2SMS_ROUTE || "q";

  // ── Send in batches ───── ─────────────────────────────────────────────────
  let sent   = 0;
  let failed = 0;

  for (let i = 0; i < validNumbers.length; i += SMS_BATCH_SIZE) {
    const batch       = validNumbers.slice(i, i + SMS_BATCH_SIZE);
    const numbersCsv  = batch.join(",");
    const batchLabel  = `batch ${Math.floor(i / SMS_BATCH_SIZE) + 1}`;

    try {
      console.log(
        `[SMS-REMINDER] Sending ${batchLabel} (${batch.length} numbers) via Fast2SMS | Route: ${smsRoute}`
      );

      const payload = {
        route:    smsRoute,
        message,
        language: "english",
        flash:    0,
        numbers:  numbersCsv,
      };

      const response = await axios.post(FAST2SMS_URL, payload, {
        headers: {
          authorization:  apiKey,
          "Content-Type": "application/json",
        },
        timeout: REQUEST_TIMEOUT_MS,
      });

      console.log(
        `[SMS-REMINDER] Fast2SMS response for ${batchLabel}:`,
        JSON.stringify(response.data)
      );

      if (response.data?.return === true) {
        sent += batch.length;
        console.log(`[SMS-REMINDER] ✅ ${batchLabel} delivered to ${batch.length} number(s).`);
      } else {
        // API returned HTTP 200 but indicated failure
        failed += batch.length;
        console.error(
          `[SMS-REMINDER] ❌ Fast2SMS rejected ${batchLabel}:`,
          JSON.stringify(response.data)
        );
      }
    } catch (err) {
      failed += batch.length;
      const f2sError = err.response?.data;
      console.error(`[SMS-REMINDER] ❌ HTTP error for ${batchLabel}:`, err.message);
      if (f2sError) {
        console.error("[SMS-REMINDER] Fast2SMS error details:", JSON.stringify(f2sError));
      }
      // Continue with next batch — don't throw; let the job log the failure and move on
    }
  }

  console.log(
    `[SMS-REMINDER] ✅ SMS complete | Sent: ${sent} | Failed: ${failed} | Skipped (invalid): ${skipped} | Session: "${sessionTitle}"`
  );

  return { sent, failed, skipped };
};

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = { sendSessionReminderSMS };
