/**
 * emailService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * General-purpose email delivery service for LurnStack.
 * Uses the same ZeptoMail SMTP transport as otpService.js.
 *
 * Exports:
 *   sendSessionReminderEmail(recipients, session, occurrence)
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const nodemailer = require("nodemailer");

// ─── SMTP Transporter (ZeptoMail) ────────────────────────────────────────────

let _transporter = null;

const getTransporter = () => {
  if (_transporter) return _transporter;

  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,        // smtp.zeptomail.in
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,      // emailapikey
      pass: process.env.SMTP_PASS,      // ZeptoMail API key
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  return _transporter;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Formats a Date object to a human-readable IST string.
 * e.g. "Tuesday, 27 May 2026 at 10:30 AM IST"
 */
const formatISTDateTime = (date) => {
  return new Date(date).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }) + " IST";
};

// ─── Session Reminder Email ───────────────────────────────────────────────────

/**
 * sendSessionReminderEmail
 * Sends a branded 10-minute reminder email to a list of recipients.
 *
 * @param {string[]}  recipientEmails  - Array of email addresses
 * @param {object}    session          - LiveSession record (with trainer relation)
 * @param {object}    occurrence       - SessionOccurrence record
 * @returns {Promise<{ sent: number, failed: number }>}
 */
const sendSessionReminderEmail = async (recipientEmails, session, occurrence) => {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const frontendUrl = process.env.FRONTEND_URL || "https://lurnstack.com";

  if (!from) {
    throw new Error("SMTP_FROM / SMTP_USER not configured in .env");
  }

  if (!recipientEmails || recipientEmails.length === 0) {
    console.log("[REMINDER] No recipients — skipping email send.");
    return { sent: 0, failed: 0 };
  }

  const transporter = getTransporter();

  const sessionTitle   = session.title || "Live Session";
  const trainerName    = session.trainer?.fullName || "Your Trainer";
  const startTimeIST   = formatISTDateTime(occurrence.startsAt);
  const joinLink       = `${frontendUrl}/sessions/join/${occurrence.id}`;
  const logoUrl        = "https://api.lurnstack.com/uploads/logo.png";

  // Determine whether this is a paid or free session for the email badge
  const isPaid = session.pricingState === "PRICED" && session.priceInPaise > 0;
  const sessionTypeBadge = isPaid
    ? `<span style="background:#fef3c7;color:#92400e;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;">PAID SESSION</span>`
    : `<span style="background:#dcfce7;color:#166534;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;">FREE SESSION</span>`;

  // ── HTML Email Body ──────────────────────────────────────────────────────
  const htmlBody = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Session Starting Soon — ${sessionTitle}</title>
    </head>
    <body style="margin:0;padding:0;background:#f1f5f9;font-family:'Helvetica Neue',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="padding:48px 20px;">
            <table width="520" cellpadding="0" cellspacing="0"
              style="background:#ffffff;border-radius:16px;overflow:hidden;
                     border:1px solid #e2e8f0;box-shadow:0 4px 24px rgba(0,0,0,0.07);">

              <!-- ── Header ───────────────────────────────────────────────── -->
              <tr>
                <td align="center"
                  style="background:linear-gradient(135deg,#16a34a,#22c55e);padding:36px 40px 28px;">
                  <img src="${logoUrl}" alt="LurnStack" width="130"
                    style="display:block;margin:0 auto 14px;" />
                  <div style="display:inline-block;background:rgba(255,255,255,0.2);
                    border-radius:20px;padding:5px 16px;margin-top:4px;">
                    <p style="margin:0;color:#ffffff;font-size:12px;font-weight:700;
                      letter-spacing:1.5px;text-transform:uppercase;">
                      ⏰ Session Reminder
                    </p>
                  </div>
                </td>
              </tr>

              <!-- ── Body ─────────────────────────────────────────────────── -->
              <tr>
                <td style="padding:40px 48px;">

                  <h2 style="margin:0 0 6px;color:#0f172a;font-size:22px;font-weight:800;line-height:1.3;">
                    Your session starts in <span style="color:#16a34a;">10 minutes!</span>
                  </h2>
                  <p style="margin:0 0 28px;color:#64748b;font-size:14px;">
                    Get ready — here are your session details.
                  </p>

                  <!-- Session Info Card -->
                  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;
                    padding:24px;margin-bottom:28px;">

                    <div style="margin-bottom:14px;">
                      ${sessionTypeBadge}
                    </div>

                    <h3 style="margin:0 0 16px;color:#0f172a;font-size:18px;font-weight:700;">
                      ${sessionTitle}
                    </h3>

                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
                          <span style="color:#64748b;font-size:13px;">🎓 Trainer</span>
                          <br/>
                          <span style="color:#0f172a;font-size:14px;font-weight:600;">${trainerName}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;">
                          <span style="color:#64748b;font-size:13px;">🕐 Starts At</span>
                          <br/>
                          <span style="color:#0f172a;font-size:14px;font-weight:600;">${startTimeIST}</span>
                        </td>
                      </tr>
                    </table>
                  </div>

                  <!-- CTA Button -->
                  <div style="text-align:center;margin:0 0 28px;">
                    <a href="${joinLink}" target="_blank"
                      style="display:inline-block;background:#16a34a;color:#ffffff;
                        padding:16px 48px;font-size:16px;font-weight:700;
                        text-decoration:none;border-radius:10px;letter-spacing:0.3px;">
                      🚀 Join Session Now
                    </a>
                  </div>

                  <!-- Fallback link -->
                  <p style="margin:0 0 8px;color:#94a3b8;font-size:11px;text-align:center;">
                    If the button doesn't work, copy and paste this link into your browser:
                  </p>
                  <p style="margin:0;word-break:break-all;text-align:center;">
                    <a href="${joinLink}" style="color:#16a34a;font-size:11px;">${joinLink}</a>
                  </p>

                </td>
              </tr>

              <!-- ── Footer ────────────────────────────────────────────────── -->
              <tr>
                <td align="center"
                  style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;">
                  <p style="margin:0 0 4px;color:#94a3b8;font-size:12px;">
                    © ${new Date().getFullYear()} LurnStack — Tamil Info Technology. All rights reserved.
                  </p>
                  <p style="margin:0;color:#cbd5e1;font-size:11px;">
                    This is an automated reminder. Please do not reply to this email.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  // ── Send to all recipients ──────────────────────────────────────────────
  let sent = 0;
  let failed = 0;

  // Send in batches of 10 to avoid overwhelming ZeptoMail
  const BATCH_SIZE = 10;
  for (let i = 0; i < recipientEmails.length; i += BATCH_SIZE) {
    const batch = recipientEmails.slice(i, i + BATCH_SIZE);
    const sendPromises = batch.map(async (email) => {
      try {
        await transporter.sendMail({
          from: `"LurnStack" <${from}>`,
          to: email,
          subject: `⏰ Starting in 10 min: ${sessionTitle}`,
          text: `Your session "${sessionTitle}" with ${trainerName} starts in 10 minutes!\n\nJoin here: ${joinLink}\n\nStart Time: ${startTimeIST}`,
          html: htmlBody,
        });
        sent++;
      } catch (err) {
        failed++;
        console.error(`[REMINDER] ❌ Failed to send to ${email}:`, err.message);
      }
    });
    await Promise.all(sendPromises);
  }

  console.log(`[REMINDER] ✅ Emails sent: ${sent} | Failed: ${failed} | Session: "${sessionTitle}"`);
  return { sent, failed };
};

// ─── Campaign Email Sending ─────────────────────────────────────────────────

/**
 * Renders the HTML content for an offer campaign email using the white responsive template.
 */
const renderCampaignHtml = (campaign) => {
  const {
    heading,
    body,
    buttonText,
    buttonLink,
    offerTitle,
    validTill,
    showLogo,
    heroImageUrl,
    theme
  } = campaign;

  const isDark = theme === "dark";
  const bgColor = isDark ? "#0f172a" : "#f8fafc";
  const containerBgColor = isDark ? "#1e293b" : "#ffffff";
  const textColor = isDark ? "#f8fafc" : "#0f172a";
  const bodyTextColor = isDark ? "#cbd5e1" : "#475569";
  const linkColor = isDark ? "#38bdf8" : "#1d4ed8";
  const btnBgColor = isDark ? "#38bdf8" : "#1e40af";
  const btnTextColor = isDark ? "#0f172a" : "#ffffff";
  const borderColor = isDark ? "#334155" : "#e2e8f0";

  const validTillStr = validTill
    ? new Date(validTill).toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "long",
        year: "numeric"
      })
    : "";

  let logoHtml = "";
  if (showLogo) {
    const serverUrl = process.env.SERVER_URL || "https://api.lurnstack.com";
    const logoUrl = `${serverUrl}/uploads/Logo3.png`;
    const logoWrapperStyle = isDark 
      ? "margin-bottom: 24px; text-align: left;"
      : "background-color: #0f172a; padding: 12px 18px; border-radius: 8px; margin-bottom: 24px; text-align: left; display: inline-block;";
    logoHtml = `
      <div style="${logoWrapperStyle}">
        <img src="${logoUrl}" alt="Tamil Info Technology" width="130" style="display:block;" />
      </div>
    `;
  }

  let heroImageHtml = "";
  if (heroImageUrl) {
    let absoluteHeroUrl = heroImageUrl;
    if (heroImageUrl && !heroImageUrl.startsWith("http://") && !heroImageUrl.startsWith("https://")) {
      const serverUrl = process.env.SERVER_URL || "https://api.lurnstack.com";
      absoluteHeroUrl = `${serverUrl}/${heroImageUrl.replace(/\\/g, "/")}`;
    }
    heroImageHtml = `
      <div style="margin-bottom: 24px; text-align: center;">
        <img src="${absoluteHeroUrl}" alt="${offerTitle}" style="max-width: 100%; height: auto; border-radius: 8px; display: block; margin: 0 auto;" />
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${heading}</title>
    </head>
    <body style="margin:0;padding:0;background-color:${bgColor};font-family:'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${bgColor};padding:32px 16px;">
        <tr>
          <td align="center">
            <table width="100%" max-width="640" style="max-width:640px;width:100%;background-color:${containerBgColor};border:1px solid ${borderColor};border-radius:12px;padding:32px;box-shadow:0 4px 12px rgba(0,0,0,0.03);">
              <tr>
                <td>
                  <!-- 1. Logo -->
                  ${logoHtml}

                  <!-- 2. Greeting -->
                  <p style="margin:0 0 16px;color:${bodyTextColor};font-size:15px;font-weight:500;text-align:left;">
                    Hey learner,
                  </p>

                  <!-- 3. Heading -->
                  <h1 style="color:${textColor};font-size:24px;font-weight:800;margin:0 0 16px;line-height:1.3;text-align:left;">
                    ${heading}
                  </h1>

                  <!-- 4. Offer Title (Main Offer) -->
                  <h2 style="color:${textColor};font-size:18px;font-weight:700;margin:0 0 20px;line-height:1.4;text-align:left;">
                    ${offerTitle}
                  </h2>

                  <!-- 5. Optional Image -->
                  ${heroImageHtml}

                  <!-- 6. Body Text -->
                  <div style="color:${bodyTextColor};font-size:15px;line-height:1.6;margin-bottom:28px;text-align:left;">
                    ${body}
                  </div>

                  <!-- 7. CTA Button -->
                  <div style="text-align:center; margin-bottom:24px;">
                    <a href="${buttonLink}" target="_blank" style="background-color:${btnBgColor};color:${btnTextColor};font-size:16px;font-weight:700;text-decoration:none;padding:14px 40px;border-radius:8px;display:inline-block;letter-spacing:0.5px;box-shadow:0 4px 6px rgba(0,0,0,0.15);">
                      ${buttonText}
                    </a>
                  </div>

                  <!-- 8. Valid Till -->
                  ${validTillStr ? `
                  <p style="margin:0 0 20px;color:${bodyTextColor};font-size:12px;text-align:center;font-weight:500;">
                    Offer valid till: <strong style="color:${textColor};">${validTillStr}</strong>
                  </p>
                  ` : ""}

                  <!-- 9. Fallback Link -->
                  <p style="margin:0 0 8px;color:${bodyTextColor};font-size:11px;text-align:center;opacity:0.8;">
                    If the button doesn't work, copy and paste this link into your browser:
                  </p>
                  <p style="margin:0 0 24px;word-break:break-all;text-align:center;">
                    <a href="${buttonLink}" style="color:${linkColor};font-size:11px;text-decoration:underline;">${buttonLink}</a>
                  </p>

                  <hr style="border:0;border-top:1px solid ${borderColor};margin:24px 0;" />

                  <!-- 10. Regards Block -->
                  <div style="color:${bodyTextColor};font-size:12px;text-align:left;opacity:0.9;">
                    <p style="margin:0 0 4px;font-weight:700;color:${textColor};">Regards,</p>
                    <p style="margin:0;font-weight:600;color:${textColor};">Team Tamil Info Technology</p>
                    <p style="margin:4px 0 0;">LurnStack, Chennai, India</p>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

/**
 * Sends a single campaign email to the specified recipient.
 */
const sendCampaignEmail = async (email, campaign) => {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!from) {
    throw new Error("SMTP_FROM / SMTP_USER not configured in .env");
  }

  const transporter = getTransporter();
  const htmlBody = renderCampaignHtml(campaign);

  return transporter.sendMail({
    from: `"LurnStack" <${from}>`,
    to: email,
    subject: campaign.subject,
    text: `${campaign.offerTitle}\n\n${campaign.heading}\n\n${campaign.body}\n\nView Offer: ${campaign.buttonLink}`,
    html: htmlBody,
  });
};

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  sendSessionReminderEmail,
  renderCampaignHtml,
  sendCampaignEmail
};

