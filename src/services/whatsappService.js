/**
 * whatsappService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Service for sending WhatsApp notifications using Meta's WhatsApp Cloud API.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const axios = require("axios");

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
  const digits = String(phone).replace(/\D/g, "");
  
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits;
  }
  // Standard E.164 formats range from 10 to 15 digits
  if (digits.length >= 10 && digits.length <= 15) {
    return digits;
  }
  return "";
};

/**
 * Sends a WhatsApp message using a pre-approved template via Meta Cloud API.
 *
 * @param {object} params
 * @param {string} params.to - Recipient phone number (raw, will be normalized)
 * @param {string} params.templateName - Name of the WhatsApp template
 * @param {string} params.languageCode - Language code (e.g., 'en')
 * @param {Array<string>} params.bodyParameters - Parameters for the template body in order: {{1}}, {{2}}, etc.
 * @param {string} [params.buttonUrl] - Optional URL for dynamic button parameter
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string, rawResponse?: any }>}
 */
const sendWhatsappTemplate = async ({ to, templateName, languageCode, bodyParameters, buttonUrl }) => {
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

  // Structure components
  const components = [];

  // Add body parameters
  if (bodyParameters && bodyParameters.length > 0) {
    components.push({
      type: "body",
      parameters: bodyParameters.map((param) => ({
        type: "text",
        text: String(param),
      })),
    });
  }

  // Add dynamic button URL parameters if provided
  if (buttonUrl) {
    // Determine the button URL dynamic suffix/path parameter
    let buttonParam = buttonUrl;
    const frontendUrl = process.env.FRONTEND_URL || "https://lurnstack.com";
    if (buttonParam.startsWith(frontendUrl)) {
      buttonParam = buttonParam.replace(frontendUrl, "");
      if (buttonParam.startsWith("/")) {
        buttonParam = buttonParam.substring(1);
      }
    }

    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [
        {
          type: "text",
          text: buttonParam,
        },
      ],
    });
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizedPhone,
    type: "template",
    template: {
      name: templateName,
      language: {
        code: languageCode || "en",
      },
      components: components.length > 0 ? components : undefined,
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
 * Sends a LurnStack session reminder WhatsApp message to a student.
 * Uses the pre-approved template variables:
 * {{1}} = student name
 * {{2}} = session title
 * {{3}} = minutes left
 * {{4}} = trainer name
 *
 * @param {object} params
 * @param {string} params.studentPhone
 * @param {string} params.studentName
 * @param {string} params.sessionTitle
 * @param {number|string} params.minutesLeft
 * @param {string} params.trainerName
 * @param {string} params.sessionId
 * @param {string} [params.buttonUrl] - Explicit button URL parameter (optional)
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
const sendSessionReminderWhatsApp = async ({
  studentPhone,
  studentName,
  sessionTitle,
  minutesLeft,
  trainerName,
  sessionId,
  buttonUrl,
}) => {
  const templateName = process.env.WHATSAPP_TEMPLATE_SESSION_REMINDER || "session_reminder";
  const languageCode = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en";
  const frontendUrl = process.env.FRONTEND_URL || "https://lurnstack.com";

  // Compute fallback or standard button URL if not explicitly provided
  const targetButtonUrl = buttonUrl || `${frontendUrl}/courses/${sessionId}`;

  const bodyParameters = [
    studentName || "Student",
    sessionTitle || "Live Session",
    String(minutesLeft || 30),
    trainerName || "Trainer",
  ];

  return sendWhatsappTemplate({
    to: studentPhone,
    templateName,
    languageCode,
    bodyParameters,
    buttonUrl: targetButtonUrl,
  });
};

module.exports = {
  normalizeWhatsappPhone,
  sendWhatsappTemplate,
  sendSessionReminderWhatsApp,
};
