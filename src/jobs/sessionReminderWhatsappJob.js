/**
 * sessionReminderWhatsappJob.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Background job that queries upcoming occurrences starting in the window
 * [now, now + WHATSAPP_REMINDER_MINUTES_BEFORE] (default 30 mins) and sends
 * WhatsApp reminders.
 *
 * Runs every 5 minutes. Also runs once 10 seconds after server startup.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const cron = require("node-cron");
const prisma = require("../config/db");
const { sendSessionReminderWhatsApp } = require("../services/whatsappService");

/**
 * Runs the main WhatsApp reminder checks and dispatches.
 */
const runWhatsappReminderJob = async () => {
  try {
    const now = new Date();
    const minutesBefore = parseInt(process.env.WHATSAPP_REMINDER_MINUTES_BEFORE || "30", 10);
    const sendToAllFree = process.env.SEND_FREE_SESSION_REMINDERS_TO_ALL === "true";

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

      if (isPaid) {
        // --- PAID SESSION RECIPIENTS ---
        // Paid session reminders go to students with booking status: paid, joined, completed
        const bookings = await prisma.booking.findMany({
          where: {
            sessionId: session.id,
            status: {
              in: ["paid", "joined", "completed"],
            },
            whatsappReminderSentAt: null, // Only fetch bookings that haven't received the reminder
          },
          include: {
            student: true,
          },
        });

        console.log(`[WHATSAPP-JOB]   → Found ${bookings.length} paid bookings eligible for reminder.`);

        for (const booking of bookings) {
          const student = booking.student;
          if (!student || !student.isActive || !student.phoneNumber) {
            // Mark booking as skipped to avoid re-evaluating it
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

          try {
            const result = await sendSessionReminderWhatsApp({
              studentPhone: student.phoneNumber,
              studentName: student.fullName,
              sessionTitle: session.title,
              minutesLeft,
              trainerName,
              sessionId: session.id,
            });

            if (result.success) {
              await prisma.booking.update({
                where: { id: booking.id },
                data: {
                  whatsappReminderSentAt: new Date(),
                  whatsappReminderStatus: "sent",
                  whatsappReminderMessageId: result.messageId,
                  whatsappReminderError: null,
                },
              });

              // Log details in WhatsAppSessionReminderLog
              await prisma.whatsAppSessionReminderLog.upsert({
                where: {
                  sessionId_userId: {
                    sessionId: session.id,
                    userId: student.id,
                  },
                },
                create: {
                  sessionId: session.id,
                  userId: student.id,
                  phone: student.phoneNumber,
                  status: "sent",
                  messageId: result.messageId,
                  sentAt: new Date(),
                },
                update: {
                  phone: student.phoneNumber,
                  status: "sent",
                  messageId: result.messageId,
                  sentAt: new Date(),
                  error: null,
                },
              });
            } else {
              await prisma.booking.update({
                where: { id: booking.id },
                data: {
                  whatsappReminderSentAt: new Date(),
                  whatsappReminderStatus: "failed",
                  whatsappReminderError: result.error || "Meta WhatsApp Cloud API error",
                },
              });

              await prisma.whatsAppSessionReminderLog.upsert({
                where: {
                  sessionId_userId: {
                    sessionId: session.id,
                    userId: student.id,
                  },
                },
                create: {
                  sessionId: session.id,
                  userId: student.id,
                  phone: student.phoneNumber,
                  status: "failed",
                  error: result.error || "Meta WhatsApp Cloud API error",
                },
                update: {
                  phone: student.phoneNumber,
                  status: "failed",
                  error: result.error || "Meta WhatsApp Cloud API error",
                },
              });
            }
          } catch (err) {
            console.error(`[WHATSAPP-JOB] Error processing paid booking reminder ${booking.id}:`, err.message);
            await prisma.booking.update({
              where: { id: booking.id },
              data: {
                whatsappReminderSentAt: new Date(),
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
          // Fetch log for the [sessionId, userId] combo
          const existingLog = await prisma.whatsAppSessionReminderLog.findUnique({
            where: {
              sessionId_userId: {
                sessionId: session.id,
                userId: student.id,
              },
            },
          });

          // Prevent duplicates.
          // For recurring sessions, if the log was updated in the last 12 hours,
          // it was sent for this occurrence. If older, we can reuse/update it.
          if (existingLog) {
            const timeSinceLastSend = now.getTime() - new Date(existingLog.updatedAt).getTime();
            const twelveHoursMs = 12 * 60 * 60 * 1000;
            if (timeSinceLastSend < twelveHoursMs && (existingLog.status === "sent" || existingLog.status === "skipped")) {
              // Already sent or skipped recently, do not send again
              continue;
            }
          }

          try {
            const result = await sendSessionReminderWhatsApp({
              studentPhone: student.phoneNumber,
              studentName: student.fullName,
              sessionTitle: session.title,
              minutesLeft,
              trainerName,
              sessionId: session.id,
            });

            await prisma.whatsAppSessionReminderLog.upsert({
              where: {
                sessionId_userId: {
                  sessionId: session.id,
                  userId: student.id,
                },
              },
              create: {
                sessionId: session.id,
                userId: student.id,
                phone: student.phoneNumber,
                status: result.success ? "sent" : "failed",
                messageId: result.messageId || null,
                error: result.success ? null : (result.error || "Meta WhatsApp Cloud API error"),
                sentAt: result.success ? new Date() : null,
              },
              update: {
                phone: student.phoneNumber,
                status: result.success ? "sent" : "failed",
                messageId: result.messageId || null,
                error: result.success ? null : (result.error || "Meta WhatsApp Cloud API error"),
                sentAt: result.success ? new Date() : null,
              },
            });
          } catch (err) {
            console.error(`[WHATSAPP-JOB] Error processing free session reminder for student ${student.id}:`, err.message);
            await prisma.whatsAppSessionReminderLog.upsert({
              where: {
                sessionId_userId: {
                  sessionId: session.id,
                  userId: student.id,
                },
              },
              create: {
                sessionId: session.id,
                userId: student.id,
                phone: student.phoneNumber,
                status: "failed",
                error: err.message,
              },
              update: {
                phone: student.phoneNumber,
                status: "failed",
                error: err.message,
              },
            });
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

  // Schedule the job to run every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    console.log("[WHATSAPP-JOB] Running scheduled 5-minute WhatsApp reminder job...");
    await runWhatsappReminderJob();
  });

  // Delay the initial execution on startup by 10 seconds
  setTimeout(async () => {
    console.log("[WHATSAPP-JOB] Running initial 10-second startup WhatsApp reminder job...");
    await runWhatsappReminderJob();
  }, 10000);

  console.log("[WHATSAPP-JOB] ⏱️ WhatsApp session reminder background job initialized (runs every 5 minutes).");
};

module.exports = {
  startSessionReminderWhatsappJob,
};
