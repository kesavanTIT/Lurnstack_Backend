/**
 * occurrenceJob.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs every day at 12:01 AM.
 * Finds all active recurring sessions and ensures occurrences are generated
 * for the next 30 days.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const cron = require("node-cron");
const prisma = require("../config/db");
const { generateOccurrences } = require("../services/occurrenceService");

cron.schedule("1 0 * * *", async () => {
  console.log("[OCCURRENCE] 🔄 Running nightly session occurrence generator...");
  try {
    const activeRecurringSessions = await prisma.liveSession.findMany({
      where: {
        isRecurring: true,
        status: "active",
      },
    });

    if (activeRecurringSessions.length === 0) {
      console.log("[OCCURRENCE] No active recurring sessions found.");
      return;
    }

    let totalGenerated = 0;
    for (const session of activeRecurringSessions) {
      const generated = await generateOccurrences(session, 30);
      if (generated) {
        totalGenerated += generated;
      }
    }

    console.log(`[OCCURRENCE] ✅ Nightly occurrence generation complete. Total generated: ${totalGenerated}`);
  } catch (error) {
    console.error("[OCCURRENCE] ❌ Error in occurrenceJob:", error.message);
  }
});

console.log("[OCCURRENCE] ⏱️  Nightly occurrence generator job registered.");
