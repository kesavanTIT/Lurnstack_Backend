/**
 * reminderJob.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs every minute. Finds SessionOccurrence records that start in exactly
 * 10–11 minutes, selects the correct recipients (paid students or all active
 * students for free sessions), sends:
 *   • Branded ZeptoMail reminder emails
 *   • Fast2SMS bulk reminder SMS messages
 * …then atomically marks reminderSent = true to prevent duplicates.
 *
 * Recipient Selection:
 *   PAID SESSION  → enrolled/paid students for that specific session
 *   FREE SESSION  → all active STUDENT-role users on the platform
 *
 * Stop Condition: cancelled / ended / paused sessions are excluded by query.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const cron   = require("node-cron");
const prisma = require("../config/db");
const { sendSessionReminderEmail } = require("../services/emailService");
// const { sendSessionReminderSMS }   = require("../services/smsService");

// ─── Cron: every minute ───────────────────────────────────────────────────────
cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();
    now.setSeconds(0, 0); // truncate to start of minute to avoid millisecond drift

    // Window: occurrences starting between now+10min and now+11min (UTC)
    const windowStart = new Date(now.getTime() + 10 * 60 * 1000); // +10 min
    const windowEnd   = new Date(now.getTime() + 11 * 60 * 1000); // +11 min

    // ── 1. Find all occurrences in the reminder window ────────────────────
    const occurrences = await prisma.sessionOccurrence.findMany({
      where: {
        reminderSent: false,
        startsAt: {
          gte: windowStart,
          lt:  windowEnd,
        },
        // Only occurrences that are scheduled (not already completed/cancelled)
        status: "scheduled",
        // Join the parent session and filter by publishState
        session: {
          publishState: "PUBLISHED",
          deleteRequested: false,
          // Exclude sessions that are cancelled, ended, or deleted
          status: {
            notIn: ["cancelled", "ended", "deleted"],
          },
          // TIT tuition classes are now fetched so we can send push notifications (they will skip email reminders).
        },
      },
      include: {
        session: {
          include: {
            trainer: {
              select: { fullName: true, email: true },
            },
          },
        },
      },
    });

    if (occurrences.length === 0) return; // Nothing to do this minute

    console.log(`[REMINDER] 🔔 Found ${occurrences.length} occurrence(s) starting in ~10 min.`);

    // ── 2. Process each occurrence individually ───────────────────────────
    for (const occurrence of occurrences) {
      const session = occurrence.session;

      try {
        let recipientEmails  = [];
        let recipientPhones  = [];
        let pushTokens       = [];

        // ── 3. Recipient Selection Logic ──────────────────────────────────
        if (session.pricingState === "PRICED" && session.priceInPaise > 0) {
          // ── PAID SESSION → only students who have paid for this specific session
          console.log(`[REMINDER] 💰 Paid session "${session.title}" — fetching paid students.`);

          const paidBookings = await prisma.booking.findMany({
            where: {
              OR: [
                {
                  sessionId: session.id,
                  status:    "paid",
                },
                session.courseId ? {
                  courseId: session.courseId,
                  accessScope: "course",
                  status: "paid",
                } : null,
              ].filter(Boolean),
            },
            include: {
              student: {
                select: {
                  id:              true,
                  email:           true,
                  phoneNumber:     true,
                  isActive:        true,
                  pushToken:       true,
                },
              },
            },
          });

          const activeBookings = paidBookings.filter((b) => b.student?.isActive);

          // Deduplicate active bookings by student ID
          const seenStudentIds = new Set();
          const uniqueActiveBookings = [];
          for (const b of activeBookings) {
            if (b.student && !seenStudentIds.has(b.student.id)) {
              seenStudentIds.add(b.student.id);
              uniqueActiveBookings.push(b);
            }
          }

          recipientEmails = uniqueActiveBookings
            .filter((b) => b.student?.email)
            .map((b) => b.student.email);

          recipientPhones = uniqueActiveBookings
            .filter((b) => b.student?.phoneNumber)
            .map((b) => {
              return b.student.phoneNumber.replace(/[^0-9]/g, '');
            });

          pushTokens = uniqueActiveBookings
            .map((b) => b.student?.pushToken)
            .filter(Boolean);

          console.log(
            `[REMINDER]   → ${recipientEmails.length} unique email(s), ${recipientPhones.length} unique phone(s) for paid students.`
          );
        } else {
          // ── FREE / PENDING_PRICE SESSION → all active STUDENT-role users
          console.log(`[REMINDER] 🆓 Free session "${session.title}" — fetching all active students.`);

          const allStudents = await prisma.user.findMany({
            where: {
              role:     "STUDENT",
              isActive: true,
            },
            select: {
              id:              true,
              email:           true,
              phoneNumber:     true,
              pushToken:       true,
            },
          });

          recipientEmails = allStudents
            .filter((u) => u.email)
            .map((u) => u.email);

          recipientPhones = allStudents
            .filter((u) => u.phoneNumber)
            .map((u) => {
              return u.phoneNumber.replace(/[^0-9]/g, '');
            });

          pushTokens = allStudents
            .map((u) => u.pushToken)
            .filter(Boolean);

          console.log(
            `[REMINDER]   → ${recipientEmails.length} email(s), ${recipientPhones.length} phone(s) for all active students.`
          );
        }

        const isTIT = session.sectionType === "TIT" || session.sessionType === "TIT" || session.source === "admin_tit_classes";

        // ── 4. Send reminders (email + Push) in parallel ───────────────────
        const notifyPromises = [];

        // Only send email reminders for regular classes (not TIT tuition classes)
        if (recipientEmails.length > 0 && !isTIT) {
          notifyPromises.push(
            sendSessionReminderEmail(recipientEmails, session, occurrence).catch((err) => {
              console.error(
                `[REMINDER] ❌ Email send failed for occurrence "${occurrence.id}":`,
                err.message
              );
            })
          );
        } else if (isTIT) {
          console.log(`[REMINDER] ℹ️  Skipping email reminder for TIT tuition class "${session.title}".`);
        } else {
          console.log(`[REMINDER] ℹ️  No email recipients for occurrence "${occurrence.id}" — skipping email.`);
        }

        // Send Push Notifications for both regular and TIT classes
        if (pushTokens.length > 0) {
          const { sendPushNotification } = require("../services/pushNotificationService");
          const targetScreen = isTIT ? "Dashboard" : "MyLearning";
          const pushTitle = isTIT ? "⏰ TIT Tuition Class Starting Soon!" : "⏰ Class Starting Soon!";
          const pushBody = `Your session "${session.title}" starts in 10 minutes.`;

          notifyPromises.push(
            sendPushNotification(pushTokens, pushTitle, pushBody, { screen: targetScreen }).catch((err) => {
              console.error(
                `[REMINDER] ❌ Push notification send failed for occurrence "${occurrence.id}":`,
                err.message
              );
            })
          );
        }

        // SMS reminders are disabled per user request (only OTP is sent via SMS)
        /*
        if (recipientPhones.length > 0) {
          notifyPromises.push(
            sendSessionReminderSMS(recipientPhones, session, occurrence).catch((err) => {
              console.error(
                `[REMINDER] ❌ SMS send failed for occurrence "${occurrence.id}":`,
                err.message
              );
            })
          );
        } else {
          console.log(`[REMINDER] ℹ️  No SMS recipients for occurrence "${occurrence.id}" — skipping SMS.`);
        }
        */

        // Wait for all channels to complete (errors are caught above, won't reject)
        await Promise.all(notifyPromises);

        // ── 5. Mark reminderSent = true (atomic transaction) ──────────────
        //       This is the critical step that prevents duplicate emails/SMS
        //       even if the cron fires slightly off.
        await prisma.$transaction([
          prisma.sessionOccurrence.update({
            where: { id: occurrence.id },
            data:  { reminderSent: true },
          }),
        ]);

        console.log(`[REMINDER] ✅ Reminders sent & occurrence "${occurrence.id}" marked as done.`);
      } catch (occurrenceError) {
        // Log per-occurrence errors but continue processing other occurrences
        console.error(
          `[REMINDER] ❌ Error processing occurrence "${occurrence.id}" for session "${session.title}":`,
          occurrenceError.message
        );
      }
    }
  } catch (error) {
    console.error("[REMINDER] ❌ Fatal error in reminderJob:", error.message);
  }
});

console.log("[REMINDER] ⏱️  10-minute session reminder job registered (email + SMS, runs every minute).");
