/**
 * whatsappService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Service for sending WhatsApp notifications using Meta's WhatsApp Cloud API.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const axios = require("axios");
const prisma = require("../config/db");

/**
 * Normalizes a phone number for Meta WhatsApp API.
 * - Strips all non-digit characters.
 * - If the length is exactly 10 digits, prefixes the Indian country code '91'.
 * - Returns an empty string if the phone number is invalid.
 *
 * @param {string|null|undefined} phone
 * @returns {string} Normalized phone number or empty string
 */
const normalizeWhatsappPhone = (phone) => {
  if (!phone) return "";
  const clean = String(phone).replace(/[\s\+\-\(\)]/g, "");
  const digits = clean.replace(/\D/g, "");
  
  if (digits.length === 10) {
    return `91${digits}`;
  }
  return digits;
};

/**
 * Sends a WhatsApp message using a template via Meta Cloud API.
 *
 * @param {object} params
 * @param {string} params.to - Recipient phone number (raw, will be normalized)
 * @param {string} params.templateName - Name of the WhatsApp template
 * @param {string} params.languageCode - Language code (e.g., 'en')
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string, rawResponse?: any }>}
 */
const sendWhatsappTemplate = async ({ to, templateName, languageCode }) => {
  const isEnabled = process.env.WHATSAPP_ENABLED === "true";
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION || "v23.0";

  // Check if WhatsApp is enabled
  if (!isEnabled) {
    console.log(`[WHATSAPP] 🧪 WhatsApp sending is disabled via WHATSAPP_ENABLED config. (To: ${to})`);
    return { success: false, error: "WhatsApp integration is disabled" };
  }

  // Validate configuration
  if (!accessToken || !phoneNumberId) {
    const errorMsg = "Missing Meta WhatsApp configuration (WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID)";
    console.error(`[WHATSAPP] ❌ Configuration Error: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  // Normalize phone number
  const normalizedPhone = normalizeWhatsappPhone(to);
  if (!normalizedPhone) {
    const errorMsg = `Invalid phone number format: ${to}`;
    console.error(`[WHATSAPP] ❌ Validation Error: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to: normalizedPhone,
    type: "template",
    template: {
      name: templateName,
      language: {
        code: languageCode || "en",
      }
    },
  };

  try {
    console.log(`[WHATSAPP] Sending template "${templateName}" to ${normalizedPhone}...`);
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });

    const data = response.data;
    const messageId = data?.messages?.[0]?.id;

    if (messageId) {
      console.log(`[WHATSAPP] ✅ Message sent successfully. ID: ${messageId} | Recipient: ${normalizedPhone}`);
      return { success: true, messageId, rawResponse: data };
    } else {
      console.error(`[WHATSAPP] ❌ API response did not contain message ID:`, JSON.stringify(data));
      return { success: false, error: "No message ID in response", rawResponse: data };
    }
  } catch (error) {
    const errorDetails = error.response?.data || error.message;
    console.error(`[WHATSAPP] ❌ Failed to send WhatsApp message to ${normalizedPhone}:`, JSON.stringify(errorDetails));
    return {
      success: false,
      error: typeof errorDetails === "object" ? JSON.stringify(errorDetails) : errorDetails,
      rawResponse: error.response?.data,
    };
  }
};

/**
 * Sends a LurnStack session reminder WhatsApp message to a student with template components.
 * Logs success/failure to database (WhatsAppReminder) and console.
 *
 * @param {object} params
 * @param {string} params.phone - Recipient phone number
 * @param {number} [params.userId] - User ID for DB tracking
 * @param {string} [params.sessionId] - Session ID for DB tracking
 * @param {string} [params.reminderType] - Reminder type (defaults to 'session_reminder_30min')
 * @param {string} [params.studentName] - Student Name (defaults to 'Rahul')
 * @param {string} [params.sessionTitle] - Session Title (defaults to 'Node.js Masterclass')
 * @param {string|number} [params.minutesLeft] - Minutes left (defaults to '30')
 * @param {string} [params.trainerName] - Trainer Name (defaults to 'Infant')
 * @param {string} [params.buttonUrl] - Explicit button URL parameter (optional)
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string, rawResponse?: any }>}
 */
const sendWhatsAppReminder = async ({
  phone,
  studentPhone,
  userId,
  sessionId,
  reminderType = "session_reminder_5min",
  studentName = "Rahul",
  sessionTitle = "Node.js Masterclass",
  minutesLeft = "5",
  trainerName = "Infant",
  buttonUrl,
  templateName: customTemplateName,
}) => {
  const targetPhone = phone || studentPhone;
  const isEnabled = process.env.WHATSAPP_ENABLED === "true";
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION || "v23.0";
  const templateName = customTemplateName || process.env.WHATSAPP_TEMPLATE_SESSION_REMINDER || "lurnstack";
  const languageCode = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en";

  // Check if WhatsApp is enabled
  if (!isEnabled) {
    console.log(`[WHATSAPP] 🧪 WhatsApp sending is disabled via WHATSAPP_ENABLED config. (To: ${targetPhone})`);
    return { success: false, error: "WhatsApp integration is disabled" };
  }

  // Validate configuration
  if (!accessToken || !phoneNumberId) {
    const errorMsg = "Missing Meta WhatsApp configuration (WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID)";
    console.error(`[WHATSAPP] ❌ Configuration Error: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  // Normalize phone number
  const normalizedPhone = normalizeWhatsappPhone(targetPhone);
  if (!normalizedPhone) {
    const errorMsg = `Invalid phone number format: ${targetPhone}`;
    console.error(`[WHATSAPP] ❌ Validation Error: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  // Log BEFORE send (Requirement 5)
  console.log("Sending WhatsApp reminder", { userId, phone: normalizedPhone, sessionId });

  // Format button dynamic URL suffix parameter
  let buttonParam = buttonUrl || sessionId || "nodejs-masterclass";
  const frontendUrl = process.env.FRONTEND_URL || "https://lurnstack.com";
  if (buttonParam.startsWith(frontendUrl)) {
    buttonParam = buttonParam.replace(frontendUrl, "");
  }
  if (buttonParam.startsWith("/courses/")) {
    buttonParam = buttonParam.replace("/courses/", "");
  }
  if (buttonParam.startsWith("courses/")) {
    buttonParam = buttonParam.replace("courses/", "");
  }
  if (buttonParam.startsWith("/")) {
    buttonParam = buttonParam.substring(1);
  }

  const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: normalizedPhone,
    type: "template",
    template: {
      name: templateName,
      language: {
        code: languageCode,
      },
      components: [
        {
          type: "body",
          parameters: [
            {
              type: "text",
              text: String(studentName),
            },
            {
              type: "text",
              text: String(sessionTitle),
            },
            {
              type: "text",
              text: String(minutesLeft),
            },
            {
              type: "text",
              text: String(trainerName),
            },
          ],
        },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [
            {
              type: "text",
              text: String(buttonParam),
            },
          ],
        },
      ],
    },
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });

    const data = response.data;
    const messageId = data?.messages?.[0]?.id;

    if (messageId) {
      // Log AFTER success (Requirement 5)
      console.log("WhatsApp reminder accepted", { userId, messageId });

      if (userId && sessionId) {
        await prisma.whatsAppReminder.upsert({
          where: {
            sessionId_userId_reminderType: {
              sessionId,
              userId,
              reminderType,
            },
          },
          create: {
            sessionId,
            userId,
            phone: normalizedPhone,
            status: "sent",
            messageId,
            sentAt: new Date(),
            reminderType,
          },
          update: {
            phone: normalizedPhone,
            status: "sent",
            messageId,
            sentAt: new Date(),
            error: null,
          },
        });
      }

      return { success: true, messageId, rawResponse: data };
    } else {
      const errorMsg = "No message ID in response";
      const errorResponse = data || { error: errorMsg };
      
      // Log AFTER failure (Requirement 5)
      console.error("WhatsApp reminder failed", { userId, phone: normalizedPhone, error: errorResponse });

      if (userId && sessionId) {
        await prisma.whatsAppReminder.upsert({
          where: {
            sessionId_userId_reminderType: {
              sessionId,
              userId,
              reminderType,
            },
          },
          create: {
            sessionId,
            userId,
            phone: normalizedPhone,
            status: "failed",
            error: JSON.stringify(errorResponse),
            reminderType,
          },
          update: {
            phone: normalizedPhone,
            status: "failed",
            error: JSON.stringify(errorResponse),
            messageId: null,
            sentAt: null,
          },
        });
      }

      return { success: false, error: errorMsg, rawResponse: data };
    }
  } catch (error) {
    const errorDetails = error.response?.data || error.message;
    
    // Log AFTER failure (Requirement 5)
    console.error("WhatsApp reminder failed", { userId, phone: normalizedPhone, error: errorDetails });

    if (userId && sessionId) {
      await prisma.whatsAppReminder.upsert({
        where: {
          sessionId_userId_reminderType: {
            sessionId,
            userId,
            reminderType,
          },
        },
        create: {
          sessionId,
          userId,
          phone: normalizedPhone,
          status: "failed",
          error: JSON.stringify(errorDetails),
          reminderType,
        },
        update: {
          phone: normalizedPhone,
          status: "failed",
          error: JSON.stringify(errorDetails),
          messageId: null,
          sentAt: null,
        },
      });
    }

    return {
      success: false,
      error: typeof errorDetails === "object" ? JSON.stringify(errorDetails) : errorDetails,
      rawResponse: error.response?.data,
    };
  }
};

module.exports = {
  normalizeWhatsappPhone,
  sendWhatsappTemplate,
  sendWhatsAppReminder,
  sendSessionReminderWhatsApp: sendWhatsAppReminder, // Alias for backwards compatibility
};
