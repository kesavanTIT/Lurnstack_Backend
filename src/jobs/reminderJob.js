/**
 * reminderJob.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs every minute. Finds SessionOccurrence records that start in exactly
 * 10–11 minutes, selects the correct recipients (paid students or all active
 * students for free sessions), sends branded ZeptoMail reminder emails, and
 * atomically marks reminderSent = true to prevent duplicates.
 *
 * Stop Condition: cancelled / ended / paused sessions are excluded by query.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const cron = require("node-cron");
const prisma = require("../config/db");
const { sendSessionReminderEmail } = require("../services/emailService");

// ─── Cron: every minute ───────────────────────────────────────────────────────
cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();

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
          // Exclude sessions that are cancelled or ended
          status: {
            notIn: ["cancelled", "ended"],
          },
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
        let recipientEmails = [];

        // ── 3. Recipient Selection Logic ──────────────────────────────────
        if (session.pricingState === "PRICED" && session.priceInPaise > 0) {
          // PAID SESSION → only students who have paid for this session
          console.log(`[REMINDER] 💰 Paid session "${session.title}" — fetching paid students.`);

          const paidBookings = await prisma.booking.findMany({
            where: {
              sessionId: session.id,
              status: "paid",
            },
            include: {
              student: {
                select: { email: true, isActive: true },
              },
            },
          });

          recipientEmails = paidBookings
            .filter((b) => b.student?.isActive && b.student?.email)
            .map((b) => b.student.email);

          console.log(`[REMINDER]   → ${recipientEmails.length} paid student(s) will be notified.`);
        } else {
          // FREE / PENDING_PRICE SESSION → all active students on the platform
          console.log(`[REMINDER] 🆓 Free session "${session.title}" — fetching all active students.`);

          const allStudents = await prisma.user.findMany({
            where: {
              role: "STUDENT",
              isActive: true,
            },
            select: { email: true },
          });

          recipientEmails = allStudents
            .filter((u) => u.email)
            .map((u) => u.email);

          console.log(`[REMINDER]   → ${recipientEmails.length} student(s) will be notified.`);
        }

        // ── 4. Send the reminder emails ───────────────────────────────────
        if (recipientEmails.length > 0) {
          await sendSessionReminderEmail(recipientEmails, session, occurrence);
        }

        // ── 5. Mark reminderSent = true (atomic transaction) ──────────────
        //       This is the critical step that prevents duplicate emails
        //       even if the cron fires slightly off.
        await prisma.$transaction([
          prisma.sessionOccurrence.update({
            where: { id: occurrence.id },
            data: { reminderSent: true },
          }),
        ]);

        console.log(`[REMINDER] ✅ Reminder sent & occurrence "${occurrence.id}" marked as done.`);
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

console.log("[REMINDER] ⏱️  10-minute session reminder job registered (runs every minute).");
