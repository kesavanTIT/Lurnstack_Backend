require('dotenv').config();
const prisma = require('../src/config/db');
const { sendWhatsAppReminder } = require('../src/services/whatsappService');

// This mimics the runWhatsappReminderJob function exactly

const runWhatsappReminderJob = async () => {
  try {
    const now = new Date();
    const minutesBefore = parseInt(process.env.WHATSAPP_REMINDER_MINUTES_BEFORE || "5", 10);
    const sendToAllFree = process.env.SEND_FREE_SESSION_REMINDERS_TO_ALL === "true";
    const reminderType = `session_reminder_${minutesBefore}min`;

    // Window: occurrence starts between now and now + minutesBefore
    const windowEnd = new Date(now.getTime() + minutesBefore * 60 * 1000);

    console.log(`[WHATSAPP-JOB] Running check. Window: ${now.toISOString()} -> ${windowEnd.toISOString()}`);

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
          },
          include: {
            student: true,
          },
        });

        console.log(`[WHATSAPP-JOB]   → Found ${bookings.length} paid bookings eligible for reminder.`);

        for (const booking of bookings) {
          const student = booking.student;
          if (!student || !student.isActive || !student.phoneNumber) {
            // Update booking status so we don't repeat checks
            console.log(`[WHATSAPP-JOB] Student is missing phone/active. Student:`, student);
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
            console.log(`[WHATSAPP-JOB] Already sent or accepted for student ${student.id}. Skipping.`);
            continue;
          }

          try {
            console.log(`[WHATSAPP-JOB] Triggering sendWhatsAppReminder for ${student.fullName}`);
            const result = await sendWhatsAppReminder({
              phone: student.phoneNumber,
              userId: student.id,
              sessionId: session.id,
              reminderType,
              studentName: student.fullName,
              sessionTitle: session.title,
              minutesLeft: String(minutesLeft),
              trainerName,
            });

            console.log(`[WHATSAPP-JOB] Result:`, result);

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
      }
    }
  } catch (error) {
    console.error("[WHATSAPP-JOB] ❌ Fatal error in runWhatsappReminderJob:", error.message);
  }
};

runWhatsappReminderJob().then(() => prisma.$disconnect());
