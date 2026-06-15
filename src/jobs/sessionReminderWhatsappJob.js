/**
 * sessionReminderWhatsappJob.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Background job that queries upcoming occurrences starting in the window
 * [now, now + WHATSAPP_REMINDER_MINUTES_BEFORE] (default 30 mins) and sends
 * WhatsApp reminders.
 *
 * Runs every 1 minute.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const cron = require("node-cron");
const prisma = require("../config/db");
const { sendWhatsAppReminder } = require("../services/whatsappService");

/**
 * Runs the main WhatsApp reminder checks and dispatches.
 */
const runWhatsappReminderJob = async () => {
  try {
    const now = new Date();
    const minutesBefore = parseInt(process.env.WHATSAPP_REMINDER_MINUTES_BEFORE || "5", 10);
    const sendToAllFree = process.env.SEND_FREE_SESSION_REMINDERS_TO_ALL === "true";
    const reminderType = `session_reminder_${minutesBefore}min`;

    // Window: occurrence starts between now and now + minutesBefore
    const windowEnd = new Date(now.getTime() + minutesBefore * 60 * 1000);

    // 1. Fetch upcoming occurrences starting within the window
    const occurrences = await prisma.sessionOccurrence.findMany({
      where: {
        startsAt: {
          gte: now,
          lte: windowEnd,
        },
        status: "scheduled",
        session: {
          publishState: "PUBLISHED",
          status: {
            notIn: ["cancelled", "ended"],
          },
        },
      },
      include: {
        session: {
          include: {
            trainer: {
              select: { fullName: true },
            },
          },
        },
      },
    });

    if (occurrences.length === 0) {
      console.log("[WHATSAPP-JOB] No upcoming session occurrences found in the reminder window.");
      return;
    }

    console.log(`[WHATSAPP-JOB] Found ${occurrences.length} occurrence(s) starting in next ${minutesBefore} minutes.`);

    for (const occurrence of occurrences) {
      const session = occurrence.session;
      const isPaid = session.pricingState === "PRICED" && (session.priceInPaise || 0) > 0;
      const trainerName = session.trainer?.fullName || "Your Trainer";

      // Calculate minutes remaining dynamically
      const minutesLeft = Math.max(0, Math.round((occurrence.startsAt.getTime() - now.getTime()) / (60 * 1000)));

      console.log(`[WHATSAPP-JOB] Processing "${session.title}" (starts in ${minutesLeft} mins, ${isPaid ? "PAID" : "FREE"}).`);

      // Skip TIT classes (Requirement 3: no WhatsApp reminders for TIT classes)
      if (session.sectionType === "TIT" || session.source === "admin_tit_classes") {
        console.log(`[WHATSAPP-JOB]   → Skipping TIT session "${session.title}". No WhatsApp reminder required.`);
        continue;
      }

      // New Backend Feature: Weekday Filtering for WhatsApp Reminders
      if (session.isRecurring) {
        let daysArray = [];
        if (session.recurringDays) {
          if (Array.isArray(session.recurringDays)) {
            daysArray = session.recurringDays;
          } else {
            try {
              daysArray = typeof session.recurringDays === "string"
                ? JSON.parse(session.recurringDays)
                : session.recurringDays;
            } catch (e) {}
          }
        }

        if (Array.isArray(daysArray) && daysArray.length > 0) {
          const weekdayStr = occurrence.startsAt.toLocaleDateString("en-US", { timeZone: "Asia/Kolkata", weekday: "long" });
          const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
          const weekday = weekdays.indexOf(weekdayStr);
          if (!daysArray.includes(weekday)) {
            console.log(`[WHATSAPP-JOB]   → Skipping session "${session.title}" because today's weekday (${weekdayStr}: ${weekday}) is not in recurringDays (${JSON.stringify(daysArray)}).`);
            continue;
          }
        } else if (session.recurrenceType === "weekly") {
          const weekdayStr = occurrence.startsAt.toLocaleDateString("en-US", { timeZone: "Asia/Kolkata", weekday: "long" });
          const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
          const weekday = weekdays.indexOf(weekdayStr);
          const createDayStr = new Date(session.createdAt).toLocaleDateString("en-US", { timeZone: "Asia/Kolkata", weekday: "long" });
          const createDayOfWeekKolkata = weekdays.indexOf(createDayStr);
          if (weekday !== createDayOfWeekKolkata) {
            console.log(`[WHATSAPP-JOB]   → Skipping session "${session.title}" because today's weekday (${weekdayStr}: ${weekday}) does not match creation day of week (${createDayStr}: ${createDayOfWeekKolkata}).`);
            continue;
          }
        }
      }

      // Respect the enableWhatsApp control setting
      if (session.enableWhatsApp === false) {
        console.log(`[WHATSAPP-JOB]   → Skipping session "${session.title}". WhatsApp reminders are disabled.`);
        continue;
      }

      if (isPaid) {
        // --- PAID SESSION RECIPIENTS ---
        // Paid session reminders go to students with booking status: paid, joined, completed
        const bookings = await prisma.booking.findMany({
          where: {
            OR: [
              {
                sessionId: session.id,
                status: {
                  in: ["paid", "joined", "completed"],
                },
              },
              session.courseId ? {
                courseId: session.courseId,
                accessScope: "course",
                status: "paid",
              } : null,
            ].filter(Boolean),
          },
          include: {
            student: true,
          },
        });

        // Deduplicate bookings by student ID
        const seenStudentIds = new Set();
        const uniqueBookings = [];
        for (const b of bookings) {
          if (b.student && !seenStudentIds.has(b.student.id)) {
            seenStudentIds.add(b.student.id);
            uniqueBookings.push(b);
          }
        }

        console.log(`[WHATSAPP-JOB]   → Found ${uniqueBookings.length} unique paid bookings eligible for reminder.`);

        for (const booking of uniqueBookings) {
          const student = booking.student;
          if (!student || !student.isActive || !student.phoneNumber) {
            // Update booking status so we don't repeat checks
            await prisma.booking.update({
              where: { id: booking.id },
              data: {
                whatsappReminderSentAt: new Date(),
                whatsappReminderStatus: "skipped",
                whatsappReminderError: "Inactive user or missing phone number",
              },
            });
            continue;
          }

          // Check if already sent or accepted in WhatsAppReminder table (Requirement 6)
          const existingReminder = await prisma.whatsAppReminder.findUnique({
            where: {
              sessionId_userId_reminderType: {
                sessionId: session.id,
                userId: student.id,
                reminderType,
              },
            },
          });

          if (existingReminder && (existingReminder.status === "sent" || existingReminder.status === "accepted")) {
            // Check if sent within the last 12 hours (to allow recurring daily reminders)
            const timeSinceLastSend = new Date().getTime() - new Date(existingReminder.updatedAt).getTime();
            const twelveHoursMs = 12 * 60 * 60 * 1000;
            if (timeSinceLastSend < twelveHoursMs) {
              continue;
            }
          }

          try {
            const result = await sendWhatsAppReminder({
              phone: student.phoneNumber,
              userId: student.id,
              sessionId: session.id,
              reminderType,
              studentName: student.fullName,
              sessionTitle: session.whatsappCustomTitle || session.title,
              minutesLeft: String(minutesLeft),
              trainerName,
              templateName: session.whatsappTemplateName || undefined,
              buttonUrl: session.whatsappButtonUrl || undefined,
            });

            // Update booking table for compatibility
            await prisma.booking.update({
              where: { id: booking.id },
              data: {
                whatsappReminderSentAt: result.success ? new Date() : null,
                whatsappReminderStatus: result.success ? "sent" : "failed",
                whatsappReminderMessageId: result.success ? result.messageId : null,
                whatsappReminderError: result.success ? null : (result.error || "Meta WhatsApp Cloud API error"),
              },
            });
          } catch (err) {
            console.error(`[WHATSAPP-JOB] Error processing paid booking reminder ${booking.id}:`, err.message);
            await prisma.booking.update({
              where: { id: booking.id },
              data: {
                whatsappReminderSentAt: null,
                whatsappReminderStatus: "failed",
                whatsappReminderError: err.message,
              },
            });
          }
        }
      } else {
        // --- FREE SESSION RECIPIENTS ---
        let targetStudents = [];

        if (sendToAllFree) {
          // Fetch all active students
          targetStudents = await prisma.user.findMany({
            where: {
              role: "STUDENT",
              isActive: true,
              phoneNumber: { not: null },
            },
          });
        } else {
          // Retrieve interested students from bookings, session bookings, cards, or attendance
          const [bookings, sessionBookings, cards, attendances] = await Promise.all([
            prisma.booking.findMany({
              where: { sessionId: session.id },
              select: { student: true },
            }),
            prisma.sessionBooking.findMany({
              where: { sessionId: session.id },
              select: { student: true },
            }),
            prisma.sessionCard.findMany({
              where: { sessionId: session.id },
              select: { student: true },
            }),
            prisma.studentAttendance.findMany({
              where: { sessionId: session.id },
              select: { student: true },
            }),
          ]);

          const studentMap = new Map();
          const addStudent = (student) => {
            if (student && student.isActive && student.phoneNumber && student.role === "STUDENT") {
              studentMap.set(student.id, student);
            }
          };

          bookings.forEach((b) => addStudent(b.student));
          sessionBookings.forEach((sb) => addStudent(sb.student));
          cards.forEach((c) => addStudent(c.student));
          attendances.forEach((a) => addStudent(a.student));

          targetStudents = Array.from(studentMap.values());
        }

        console.log(`[WHATSAPP-JOB]   → Found ${targetStudents.length} interested students for free session.`);

        for (const student of targetStudents) {
          // Check if already sent or accepted in WhatsAppReminder table (Requirement 6)
          const existingReminder = await prisma.whatsAppReminder.findUnique({
            where: {
              sessionId_userId_reminderType: {
                sessionId: session.id,
                userId: student.id,
                reminderType,
              },
            },
          });

          if (existingReminder && (existingReminder.status === "sent" || existingReminder.status === "accepted")) {
            // Check if sent within the last 12 hours (to allow recurring daily reminders)
            const timeSinceLastSend = new Date().getTime() - new Date(existingReminder.updatedAt).getTime();
            const twelveHoursMs = 12 * 60 * 60 * 1000;
            if (timeSinceLastSend < twelveHoursMs) {
              continue;
            }
          }

          try {
            await sendWhatsAppReminder({
              phone: student.phoneNumber,
              userId: student.id,
              sessionId: session.id,
              reminderType,
              studentName: student.fullName,
              sessionTitle: session.whatsappCustomTitle || session.title,
              minutesLeft: String(minutesLeft),
              trainerName,
              templateName: session.whatsappTemplateName || undefined,
              buttonUrl: session.whatsappButtonUrl || undefined,
            });
          } catch (err) {
            console.error(`[WHATSAPP-JOB] Error processing free session reminder for student ${student.id}:`, err.message);
          }
        }
      }
    }
  } catch (error) {
    console.error("[WHATSAPP-JOB] ❌ Fatal error in runWhatsappReminderJob:", error.message);
  }
};

/**
 * Initializes and schedules the WhatsApp reminder cron job.
 */
const startSessionReminderWhatsappJob = () => {
  const isEnabled = process.env.WHATSAPP_ENABLED === "true";
  if (!isEnabled) {
    console.log("[WHATSAPP-JOB] ⏱️ WhatsApp reminders are disabled via WHATSAPP_ENABLED config.");
    return;
  }

  // Schedule the job to run every 1 minute
  cron.schedule("* * * * *", async () => {
    console.log("[WHATSAPP-JOB] Running scheduled 1-minute WhatsApp reminder job...");
    await runWhatsappReminderJob();
  });

  // Delay the initial execution on startup by 10 seconds
  setTimeout(async () => {
    console.log("[WHATSAPP-JOB] Running initial 10-second startup WhatsApp reminder job...");
    await runWhatsappReminderJob();
  }, 10000);

  console.log("[WHATSAPP-JOB] ⏱️ WhatsApp session reminder background job initialized (runs every 1 minute).");
};

module.exports = {
  startSessionReminderWhatsappJob,
};
