/**
 * dailyStreakReminderJob.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs every day at 7:00 PM IST (13:30 UTC).
 * Sends a daily push notification to all active students, reminding them
 * to maintain their streak and study on LurnStack.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const cron = require("node-cron");
const prisma = require("../config/db");
const { sendPushNotification } = require("../services/pushNotificationService");

// Schedule to run every day at 19:00 IST / 13:30 UTC
cron.schedule("30 13 * * *", async () => {
  try {
    console.log("[STREAK-JOB] Running daily study & streak reminder job...");

    // Fetch all active students with registered push tokens
    const activeStudents = await prisma.user.findMany({
      where: {
        role: "STUDENT",
        isActive: true,
        pushToken: {
          not: null
        }
      },
      select: {
        pushToken: true
      }
    });

    if (activeStudents.length === 0) {
      console.log("[STREAK-JOB] No active students with push tokens found.");
      return;
    }

    const pushTokens = activeStudents.map((s) => s.pushToken).filter(Boolean);

    const title = "🔥 Keep your learning streak alive!";
    const body = "Spend just 10 minutes today to learn something new and maintain your streak.";

    // Send notifications to all active students, deep-linking them to Dashboard
    await sendPushNotification(pushTokens, title, body, { screen: "Dashboard" });

    console.log(`[STREAK-JOB] Successfully sent daily streak notifications to ${pushTokens.length} students.`);
  } catch (error) {
    console.error("[STREAK-JOB] Error in dailyStreakReminderJob:", error.message);
  }
});

console.log("[STREAK-JOB] ⏱️  Daily study/streak reminder job registered (runs daily at 7 PM IST).");
