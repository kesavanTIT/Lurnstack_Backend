/**
 * pushNotificationService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Service for sending push notifications via Expo Push API to the LurnStack Mobile App.
 * Supports deep linking by passing custom metadata.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const { Expo } = require("expo-server-sdk");

// Create a new Expo SDK client
let expo = new Expo();

/**
 * Sends a push notification to one or multiple Expo Push Tokens.
 *
 * @param {string|string[]} pushTokens - A single token string, or an array of token strings
 * @param {string} title - Notification title
 * @param {string} body - Notification message body
 * @param {object} [screenData={}] - Custom data payload, e.g. { screen: 'MyLearning' } for deep linking
 * @returns {Promise<{ successCount: number, failureCount: number }>}
 */
const sendPushNotification = async (pushTokens, title, body, screenData = {}) => {
  if (!pushTokens || pushTokens.length === 0) {
    console.log("[PUSH] No push tokens provided — skipping send.");
    return { successCount: 0, failureCount: 0 };
  }

  // Normalize tokens to an array
  const tokens = Array.isArray(pushTokens) ? pushTokens : [pushTokens];
  const validTokens = [];
  let invalidCount = 0;

  for (const token of tokens) {
    if (token && Expo.isExpoPushToken(token)) {
      validTokens.push(token);
    } else {
      console.warn(`[PUSH] Invalid Expo Push Token detected and skipped: ${token}`);
      invalidCount++;
    }
  }

  if (validTokens.length === 0) {
    console.log("[PUSH] No valid push tokens found to send notifications to.");
    return { successCount: 0, failureCount: invalidCount };
  }

  // Construct the push notification messages
  const messages = validTokens.map((token) => ({
    to: token,
    sound: "default",
    title,
    body,
    data: screenData, // Custom payload for navigation (deep linking) e.g., { screen: 'MyLearning' }
    priority: "high",
    channelId: "default",
  }));

  // Chunk notifications to comply with Expo API limits (max 100 per request)
  let chunks = expo.chunkPushNotifications(messages);
  let successCount = 0;
  let failureCount = invalidCount;

  console.log(`[PUSH] Sending ${messages.length} notifications in ${chunks.length} chunks...`);

  for (let chunk of chunks) {
    try {
      let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      
      // Analyze tickets for errors
      for (let ticket of ticketChunk) {
        if (ticket.status === "ok") {
          successCount++;
        } else {
          console.error(`[PUSH] Send ticket error:`, ticket.details || ticket.message);
          failureCount++;
        }
      }
    } catch (error) {
      console.error("[PUSH] Error sending chunk of push notifications:", error);
      failureCount += chunk.length;
    }
  }

  return { successCount, failureCount };
};

/**
 * Sends a notification to a specific User ID.
 * Helper to query the DB for the user's token and call sendPushNotification.
 *
 * @param {number} userId - The user's database ID
 * @param {string} title - Notification title
 * @param {string} body - Notification message body
 * @param {object} [screenData={}] - Custom data payload for deep linking
 * @returns {Promise<boolean>} Resolves to true if sent successfully
 */
const sendPushToUser = async (userId, title, body, screenData = {}) => {
  try {
    const prisma = require("../config/db");
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { pushToken: true }
    });

    if (!user || !user.pushToken) {
      console.log(`[PUSH] User ${userId} has no registered push token — skipping.`);
      return false;
    }

    const result = await sendPushNotification(user.pushToken, title, body, screenData);
    return result.successCount > 0;
  } catch (error) {
    console.error(`[PUSH] Failed to send push to user ${userId}:`, error);
    return false;
  }
};

/**
 * Sends a notification to multiple User IDs.
 * Helper to query the DB for the users' tokens and call sendPushNotification.
 *
 * @param {number[]} userIds - Array of user database IDs
 * @param {string} title - Notification title
 * @param {string} body - Notification message body
 * @param {object} [screenData={}] - Custom data payload for deep linking
 * @returns {Promise<{ successCount: number, failureCount: number }>}
 */
const sendPushToUsers = async (userIds, title, body, screenData = {}) => {
  try {
    if (!userIds || userIds.length === 0) {
      return { successCount: 0, failureCount: 0 };
    }

    const prisma = require("../config/db");
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, pushToken: true }
    });

    const tokens = users
      .map(u => u.pushToken)
      .filter(token => token !== null && token !== undefined && token !== "");

    return await sendPushNotification(tokens, title, body, screenData);
  } catch (error) {
    console.error(`[PUSH] Failed to send push to user array:`, error);
    return { successCount: 0, failureCount: userIds.length };
  }
};

module.exports = {
  sendPushNotification,
  sendPushToUser,
  sendPushToUsers
};
