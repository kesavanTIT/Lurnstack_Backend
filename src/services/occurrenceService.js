/**
 * occurrenceService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates SessionOccurrence records for a given LiveSession.
 * - Non-recurring: Generates exactly 1 occurrence.
 * - Recurring: Generates occurrences for the next N days.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const prisma = require("../config/db");

const getKolkataDateString = (date = new Date()) => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

const getKolkataDateTime = (dateStr, timeStr) =>
  new Date(`${dateStr}T${timeStr}:00+05:30`);

const generateOccurrences = async (session, daysToGenerate = 30) => {
  try {
    const occurrencesData = [];
    
    // Determine how many days to iterate
    const numDays = session.isRecurring ? daysToGenerate : 1;

    // Use current date for iteration if recurring, otherwise use creation date
    const startDate = session.isRecurring ? new Date() : new Date(session.createdAt);

    for (let i = 0; i < numDays; i++) {
      const currentIterDate = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = getKolkataDateString(currentIterDate);
      
      // Basic Recurrence logic
      if (session.isRecurring && session.recurrenceType === "weekly") {
        const createDayOfWeek = new Date(session.createdAt).getDay();
        if (currentIterDate.getDay() !== createDayOfWeek) {
          continue; // skip days that don't match the creation day of week
        }
      }

      // Check if this date is in cancelledDates
      let cancelledArray = [];
      if (session.cancelledDates) {
        if (Array.isArray(session.cancelledDates)) cancelledArray = session.cancelledDates;
        else {
          try { cancelledArray = JSON.parse(session.cancelledDates); } catch (e) {}
        }
      }
      if (cancelledArray.includes(dateStr)) continue;

      const startsAt = session.startTime ? getKolkataDateTime(dateStr, session.startTime) : null;
      const endsAt = session.endTime ? getKolkataDateTime(dateStr, session.endTime) : null;

      if (startsAt && endsAt) {
        occurrencesData.push({
          courseId: session.courseId || "default",
          sessionId: session.id,
          trainerId: session.trainerId,
          occurrenceDate: new Date(`${dateStr}T00:00:00Z`), // start of day UTC
          startsAt,
          endsAt,
          status: "scheduled",
          reminderSent: false,
        });
      }
    }

    if (occurrencesData.length > 0) {
      // Upsert to avoid Unique Constraint violation
      for (const data of occurrencesData) {
        await prisma.sessionOccurrence.upsert({
          where: {
            sessionId_occurrenceDate: {
              sessionId: data.sessionId,
              occurrenceDate: data.occurrenceDate
            }
          },
          update: {
            startsAt: data.startsAt,
            endsAt: data.endsAt,
            courseId: data.courseId
          },
          create: data
        });
      }
      console.log(`[OCCURRENCE] ✅ Generated ${occurrencesData.length} occurrences for session "${session.title}"`);
    }
    return occurrencesData.length;
  } catch (error) {
    console.error("[OCCURRENCE] ❌ Error generating occurrences:", error.message);
  }
};

module.exports = {
  generateOccurrences,
};
