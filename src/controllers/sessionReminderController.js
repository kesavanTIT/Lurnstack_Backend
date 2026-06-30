/**
 * sessionReminderController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles:
 *   1. Admin session review + price approval + publish
 *   2. Student upcoming sessions list (with pricing state)
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const prisma                = require("../config/db");
const { generateOccurrences } = require("../services/occurrenceService");

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Admin reviews a trainer-created session, optionally sets price,
//          and publishes it so students can see it.
// @route   PUT /api/admin/sessions/:sessionId/review
// @access  Private / Admin
// ─────────────────────────────────────────────────────────────────────────────
const reviewAndPublishSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    // price is in Paise (e.g. 49900 = ₹499). Send 0 or omit to mark FREE.
    const { price, notes, enableWhatsApp, whatsappTemplateName, whatsappCustomTitle, whatsappButtonUrl } = req.body;

    // 1. Check the session exists
    const existing = await prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: { trainer: { select: { fullName: true, email: true } } },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Session not found.",
      });
    }

    // 2. Determine pricing state from the supplied price
    let pricingState;
    let priceInPaise;

    const parsedPrice = Number(price);

    if (price === undefined || price === null || price === "" || isNaN(parsedPrice) || parsedPrice <= 0) {
      // No price supplied or zero/negative → FREE (store as 0 paise)
      pricingState  = "FREE";
      priceInPaise  = 0;
    } else {
      // Price supplied and positive → PRICED
      pricingState  = "PRICED";
      priceInPaise  = parsedPrice;
    }

    const updatePayload = {
      pricingState,
      priceInPaise,
      publishState: "PUBLISHED",
      status: existing.status === "active" ? "active" : existing.status,
    };

    if (enableWhatsApp !== undefined) {
      updatePayload.enableWhatsApp = enableWhatsApp === true || enableWhatsApp === "true";
    } else {
      // Default to true for FREE classes, false for PAID classes
      updatePayload.enableWhatsApp = (pricingState === "FREE");
    }

    if (whatsappTemplateName !== undefined) updatePayload.whatsappTemplateName = whatsappTemplateName || null;
    if (whatsappCustomTitle !== undefined) updatePayload.whatsappCustomTitle = whatsappCustomTitle || null;
    if (whatsappButtonUrl !== undefined) updatePayload.whatsappButtonUrl = whatsappButtonUrl || null;

    // 3. Update the session: set pricing + publish it
    const updated = await prisma.liveSession.update({
      where: { id: sessionId },
      data: updatePayload,
      include: {
        trainer: { select: { fullName: true, email: true } },
      },
    });

    // 4. Regenerate occurrences so startsAt is based on TODAY (not session creation date).
    //    This fixes the case where a trainer creates a session on Day 1 but admin
    //    only publishes it on Day 7 — the old occurrence startsAt would be in the past.
    //    We also reset reminderSent=false on any stale occurrence so the reminder fires fresh.
    try {
      // Delete stale occurrences that are in the past or already sent
      await prisma.sessionOccurrence.deleteMany({
        where: {
          sessionId,
          OR: [
            { reminderSent: true },
            { startsAt: { lt: new Date() } },
          ],
        },
      });

      // Regenerate with "today" as base so all new startsAt values are upcoming
      const sessionForOccurrence = {
        ...updated,
        createdAt: new Date(), // Override: treat "today" as the base date for occurrence generation
      };
      await generateOccurrences(sessionForOccurrence, updated.isRecurring ? 30 : 1);

      console.log(`[PUBLISH] ✅ Occurrences regenerated for session "${updated.title}" (reminderSent reset).`);
    } catch (occErr) {
      // Non-fatal: log but don't fail the publish response
      console.error("[PUBLISH] ⚠️ Could not regenerate occurrences after publish:", occErr.message);
    }

    const isFree = pricingState === "FREE" || pricingState === "PENDING_PRICE";

    return res.status(200).json({
      success: true,
      message: `Session "${updated.title}" has been ${isFree ? "set as FREE and" : `priced at ₹${(priceInPaise / 100).toFixed(2)} and`} published successfully.`,
      data: {
        id:            updated.id,
        title:         updated.title,
        pricingState:  updated.pricingState,
        publishState:  updated.publishState,
        priceInPaise:  updated.priceInPaise,
        isFree,
        trainerName:   updated.trainer?.fullName,
        status:        updated.status,
        updatedAt:     updated.updatedAt,
      },
    });
  } catch (error) {
    console.error("reviewAndPublishSession Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to review session.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Returns all PUBLISHED sessions with pricing state for students.
//          Frontend uses pricingState / isFree to render Free or Paid badge.
// @route   GET /api/sessions/upcoming
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const getUpcomingSessions = async (req, res) => {
  try {
    const now = new Date();

    const sessions = await prisma.liveSession.findMany({
      where: {
        publishState: "PUBLISHED",
        deleteRequested: false,
        status: {
          // Exclude permanently ended, cancelled, or deleted sessions
          notIn: ["ended", "cancelled", "deleted"],
        },
        OR: [
          { sectionType: { not: "TIT" } },
          { sectionType: null },
        ],
      },
      include: {
        trainer: { select: { fullName: true } },
        pricing: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const categories = await prisma.category.findMany();
    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    const todayStr = getKolkataDateString(now);

    const formatted = sessions.map((session) => {
      // Calculate scheduled start time for display
      const dateStr = session.isRecurring
        ? todayStr
        : getKolkataDateString(new Date(session.createdAt));

      const scheduledAt = session.startTime
        ? getKolkataDateTime(dateStr, session.startTime)
        : null;
      const endsAt = session.endTime
        ? getKolkataDateTime(dateStr, session.endTime)
        : null;

      // Category resolution
      const cat = session.courseId ? categoryMap.get(session.courseId) : null;
      const courseTitle = (cat?.name) || session.courseTitle || null;
      const categoryName = (cat?.description) || session.category || null;

      // Pricing resolution
      const isFree =
        session.pricingState === "FREE" ||
        session.pricingState === "PENDING_PRICE" ||
        !session.priceInPaise ||
        session.priceInPaise <= 0;

      // Price in Rupees for display (null if free)
      const priceINR = !isFree && session.priceInPaise
        ? (session.priceInPaise / 100).toFixed(2)
        : null;

      return {
        id:             session.id,
        title:          session.title,
        subtitle:       session.subtitle,
        description:    session.description,
        courseTitle,
        category:       categoryName,
        trainerName:    session.trainer?.fullName || null,
        thumbnail:      session.thumbnail,
        startTime:      session.startTime,
        endTime:        session.endTime,
        scheduledAt,
        endsAt,
        isRecurring:    session.isRecurring,
        recurrenceType: session.recurrenceType,
        status:         session.status,
        publishState:   session.publishState,

        // ── Pricing fields (key fields for frontend) ──
        pricingState:   session.pricingState,  // "PENDING_PRICE" | "FREE" | "PRICED"
        isFree,                                 // boolean — use this to render "Free" or "Paid"
        priceInPaise:   session.priceInPaise,  // raw paise value for payment flow
        priceINR,                               // formatted string e.g. "499.00" or null
        currency:       "INR",
        meetingLink:    session.meetingLink,
        createdAt:      session.createdAt,
      };
    });

    return res.status(200).json({
      success: true,
      count: formatted.length,
      data: formatted,
    });
  } catch (error) {
    console.error("getUpcomingSessions Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to fetch upcoming sessions.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Admin: Get all sessions with their pricingState for review
// @route   GET /api/admin/sessions/pending-review
// @access  Private / Admin
// ─────────────────────────────────────────────────────────────────────────────
const getPendingReviewSessions = async (req, res) => {
  try {
    const sessions = await prisma.liveSession.findMany({
      where: {
        OR: [
          { publishState: "DRAFT" },
          { pricingState: "PENDING_PRICE" },
        ],
        status: { notIn: ["ended", "cancelled"] },
      },
      include: {
        trainer: { select: { fullName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = sessions.map((s) => ({
      id:           s.id,
      title:        s.title,
      trainerName:  s.trainer?.fullName || null,
      trainerEmail: s.trainer?.email || null,
      pricingState: s.pricingState,
      publishState: s.publishState,
      priceInPaise: s.priceInPaise,
      status:       s.status,
      createdAt:    s.createdAt,
    }));

    return res.status(200).json({
      success: true,
      count: formatted.length,
      data: formatted,
    });
  } catch (error) {
    console.error("getPendingReviewSessions Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to fetch sessions for review.",
    });
  }
};

module.exports = {
  reviewAndPublishSession,
  getUpcomingSessions,
  getPendingReviewSessions,
};
