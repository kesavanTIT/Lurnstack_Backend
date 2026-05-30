"use strict";

const prisma = require("../config/db");
const { renderCampaignHtml, sendCampaignEmail } = require("../services/emailService");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

// ─── Sanitization Helpers ───────────────────────────────────────────────────

const sanitizeHtml = (html) => {
  if (!html) return "";
  return html
    .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, "")
    .replace(/<iframe[^>]*>([\s\S]*?)<\/iframe>/gi, "")
    .replace(/on\w+\s*=\s*(['"][^'"]*['"]|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
};

const sanitizePlainText = (text) => {
  if (!text) return "";
  return text.replace(/<[^>]*>/g, "").trim();
};

// ─── CTA Link Generator ─────────────────────────────────────────────────────

const generateButtonLink = (campaignId, categoryIds, courseId, sessionId) => {
  const studentAppUrl = process.env.STUDENT_APP_URL || "https://lurnstack.com";
  if (sessionId) {
    return `${studentAppUrl}/sessions/${sessionId}?campaignId=${campaignId}`;
  } else if (courseId) {
    return `${studentAppUrl}/courses/${encodeURIComponent(courseId)}?campaignId=${campaignId}`;
  } else if (categoryIds && categoryIds.length === 1) {
    return `${studentAppUrl}/categories/${categoryIds[0]}?campaignId=${campaignId}`;
  } else if (categoryIds && categoryIds.length > 1) {
    const ids = categoryIds.join(",");
    return `${studentAppUrl}/categories?ids=${ids}&campaignId=${campaignId}`;
  }
  return `${studentAppUrl}/categories?campaignId=${campaignId}`;
};

// ─── Recipient Resolver ─────────────────────────────────────────────────────

const resolveRecipients = async ({ categoryIds, courseId, sessionId, audienceType }) => {
  let studentIds = new Set();

  // Resolve categoryIds (which may be parent descriptions or IDs) to Category record IDs
  const resolvedCategories = await prisma.category.findMany({
    where: {
      OR: [
        { id: { in: categoryIds } },
        { description: { in: categoryIds } }
      ]
    },
    select: { id: true }
  });
  const resolvedCategoryIds = resolvedCategories.map(c => c.id);

  // 1. Resolve based on targeting hierarchy (session -> course -> categories)
  if (sessionId) {
    const [bookings, sessionBookings, cards, attendances] = await Promise.all([
      prisma.booking.findMany({ where: { sessionId }, select: { studentId: true } }),
      prisma.sessionBooking.findMany({ where: { sessionId }, select: { studentId: true } }),
      prisma.sessionCard.findMany({ where: { sessionId }, select: { studentId: true } }),
      prisma.attendance.findMany({ where: { sessionId }, select: { studentId: true } })
    ]);
    bookings.forEach(b => studentIds.add(b.studentId));
    sessionBookings.forEach(sb => studentIds.add(sb.studentId));
    cards.forEach(c => studentIds.add(c.studentId));
    attendances.forEach(a => studentIds.add(a.studentId));
  } else if (courseId) {
    const sessions = await prisma.liveSession.findMany({ where: { courseId }, select: { id: true } });
    const sessionIds = sessions.map(s => s.id);
    if (sessionIds.length > 0) {
      const [bookings, sessionBookings, cards, attendances] = await Promise.all([
        prisma.booking.findMany({ where: { sessionId: { in: sessionIds } }, select: { studentId: true } }),
        prisma.sessionBooking.findMany({ where: { sessionId: { in: sessionIds } }, select: { studentId: true } }),
        prisma.sessionCard.findMany({ where: { sessionId: { in: sessionIds } }, select: { studentId: true } }),
        prisma.attendance.findMany({ where: { sessionId: { in: sessionIds } }, select: { studentId: true } })
      ]);
      bookings.forEach(b => studentIds.add(b.studentId));
      sessionBookings.forEach(sb => studentIds.add(sb.studentId));
      cards.forEach(c => studentIds.add(c.studentId));
      attendances.forEach(a => studentIds.add(a.studentId));
    }
  } else if (resolvedCategoryIds.length > 0) {
    const sessions = await prisma.liveSession.findMany({ where: { courseId: { in: resolvedCategoryIds } }, select: { id: true } });
    const sessionIds = sessions.map(s => s.id);
    if (sessionIds.length > 0) {
      const [bookings, sessionBookings, cards, attendances] = await Promise.all([
        prisma.booking.findMany({ where: { sessionId: { in: sessionIds } }, select: { studentId: true } }),
        prisma.sessionBooking.findMany({ where: { sessionId: { in: sessionIds } }, select: { studentId: true } }),
        prisma.sessionCard.findMany({ where: { sessionId: { in: sessionIds } }, select: { studentId: true } }),
        prisma.attendance.findMany({ where: { sessionId: { in: sessionIds } }, select: { studentId: true } })
      ]);
      bookings.forEach(b => studentIds.add(b.studentId));
      sessionBookings.forEach(sb => studentIds.add(sb.studentId));
      cards.forEach(c => studentIds.add(c.studentId));
      attendances.forEach(a => studentIds.add(a.studentId));
    }
  }

  // 2. Apply audienceType filters
  let finalStudents = [];

  if (audienceType === "all_students") {
    finalStudents = await prisma.user.findMany({
      where: { role: "STUDENT", isActive: true },
      select: { id: true, email: true }
    });
  } else if (audienceType === "inactive_students") {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [activeBookings, activeAttendances] = await Promise.all([
      prisma.booking.findMany({ where: { createdAt: { gte: thirtyDaysAgo } }, select: { studentId: true } }),
      prisma.attendance.findMany({ where: { createdAt: { gte: thirtyDaysAgo } }, select: { studentId: true } })
    ]);

    const activeStudentIds = new Set([
      ...activeBookings.map(b => b.studentId),
      ...activeAttendances.map(a => a.studentId)
    ]);

    const allStudents = await prisma.user.findMany({
      where: { role: "STUDENT", isActive: true },
      select: { id: true, email: true }
    });

    finalStudents = allStudents.filter(s => !activeStudentIds.has(s.id));
  } else if (audienceType === "category_students") {
    let categoryStudentIds = new Set();
    if (resolvedCategoryIds.length > 0) {
      const sessions = await prisma.liveSession.findMany({ where: { courseId: { in: resolvedCategoryIds } }, select: { id: true } });
      const sessionIds = sessions.map(s => s.id);
      if (sessionIds.length > 0) {
        const [bookings, sessionBookings, cards, attendances] = await Promise.all([
          prisma.booking.findMany({ where: { sessionId: { in: sessionIds } }, select: { studentId: true } }),
          prisma.sessionBooking.findMany({ where: { sessionId: { in: sessionIds } }, select: { studentId: true } }),
          prisma.sessionCard.findMany({ where: { sessionId: { in: sessionIds } }, select: { studentId: true } }),
          prisma.attendance.findMany({ where: { sessionId: { in: sessionIds } }, select: { studentId: true } })
        ]);
        bookings.forEach(b => categoryStudentIds.add(b.studentId));
        sessionBookings.forEach(sb => categoryStudentIds.add(sb.studentId));
        cards.forEach(c => categoryStudentIds.add(c.studentId));
        attendances.forEach(a => categoryStudentIds.add(a.studentId));
      }
    }

    const filterIds = (sessionId || courseId)
      ? [...studentIds].filter(id => categoryStudentIds.has(id))
      : [...categoryStudentIds];

    finalStudents = await prisma.user.findMany({
      where: { id: { in: filterIds }, role: "STUDENT", isActive: true },
      select: { id: true, email: true }
    });
  } else if (audienceType === "course_students") {
    let courseStudentIds = new Set();
    if (courseId) {
      const sessions = await prisma.liveSession.findMany({ where: { courseId }, select: { id: true } });
      const sessionIds = sessions.map(s => s.id);
      if (sessionIds.length > 0) {
        const [bookings, sessionBookings, cards, attendances] = await Promise.all([
          prisma.booking.findMany({ where: { sessionId: { in: sessionIds } }, select: { studentId: true } }),
          prisma.sessionBooking.findMany({ where: { sessionId: { in: sessionIds } }, select: { studentId: true } }),
          prisma.sessionCard.findMany({ where: { sessionId: { in: sessionIds } }, select: { studentId: true } }),
          prisma.attendance.findMany({ where: { sessionId: { in: sessionIds } }, select: { studentId: true } })
        ]);
        bookings.forEach(b => courseStudentIds.add(b.studentId));
        sessionBookings.forEach(sb => courseStudentIds.add(sb.studentId));
        cards.forEach(c => courseStudentIds.add(c.studentId));
        attendances.forEach(a => courseStudentIds.add(a.studentId));
      }
    }

    const filterIds = sessionId
      ? [...studentIds].filter(id => courseStudentIds.has(id))
      : [...courseStudentIds];

    finalStudents = await prisma.user.findMany({
      where: { id: { in: filterIds }, role: "STUDENT", isActive: true },
      select: { id: true, email: true }
    });
  } else if (audienceType === "session_students") {
    let sessionStudentIds = new Set();
    if (sessionId) {
      const [bookings, sessionBookings, cards, attendances] = await Promise.all([
        prisma.booking.findMany({ where: { sessionId }, select: { studentId: true } }),
        prisma.sessionBooking.findMany({ where: { sessionId }, select: { studentId: true } }),
        prisma.sessionCard.findMany({ where: { sessionId }, select: { studentId: true } }),
        prisma.attendance.findMany({ where: { sessionId }, select: { studentId: true } })
      ]);
      bookings.forEach(b => sessionStudentIds.add(b.studentId));
      sessionBookings.forEach(sb => sessionStudentIds.add(sb.studentId));
      cards.forEach(c => sessionStudentIds.add(c.studentId));
      attendances.forEach(a => sessionStudentIds.add(a.studentId));
    }

    finalStudents = await prisma.user.findMany({
      where: { id: { in: [...sessionStudentIds] }, role: "STUDENT", isActive: true },
      select: { id: true, email: true }
    });
  } else {
    // Fallback: use targeting resolved list
    finalStudents = await prisma.user.findMany({
      where: { id: { in: [...studentIds] }, role: "STUDENT", isActive: true },
      select: { id: true, email: true }
    });
  }

  return finalStudents;
};

// ─── Targets Validation ─────────────────────────────────────────────────────

const validateCampaignTargets = async (categoryIds, courseId, sessionId) => {
  // Validate categoryIds exist in the Category table (as descriptions or IDs)
  for (const catId of categoryIds) {
    const exists = await prisma.category.findFirst({
      where: {
        OR: [
          { id: catId },
          { description: { equals: catId, mode: 'insensitive' } }
        ]
      }
    });
    if (!exists) {
      return { valid: false, message: `Category '${catId}' does not exist.` };
    }
  }

  // Validate course exists and belongs to the selected categories
  if (courseId) {
    const course = await prisma.category.findUnique({
      where: { id: courseId }
    });
    if (!course) {
      return { valid: false, message: `The course with ID '${courseId}' does not exist.` };
    }
    const parentCategory = course.description || "General";
    const matchesCategory = categoryIds.includes(parentCategory) || categoryIds.includes(course.id);
    if (!matchesCategory) {
      return { valid: false, message: `The course '${course.name}' does not belong to the selected categories.` };
    }
  }

  // Validate session exists and belongs to selected course and categories
  if (sessionId) {
    const session = await prisma.liveSession.findUnique({
      where: { id: sessionId }
    });
    if (!session) {
      return { valid: false, message: "The selected session does not exist." };
    }
    
    const parentCategory = session.category || "General";
    const matchesCategory = categoryIds.includes(parentCategory) || (session.courseId && categoryIds.includes(session.courseId));
    if (!matchesCategory) {
      return { valid: false, message: "The selected session does not belong to the selected categories." };
    }

    if (courseId && session.courseId !== courseId) {
      return { valid: false, message: "The selected session does not belong to the selected course." };
    }
  }

  return { valid: true };
};

// ─── Controllers ────────────────────────────────────────────────────────────

// 1. GET /api/admin/offer-targets
const getOfferTargets = async (req, res) => {
  try {
    const categoriesList = await prisma.category.findMany({
      orderBy: { name: "asc" }
    });

    const sessionsList = await prisma.liveSession.findMany({
      where: { status: "active" },
      select: {
        id: true,
        title: true,
        courseId: true,
        courseTitle: true,
        category: true
      }
    });

    // Parent Categories are mapped from distinct description values in the Category table
    const distinctCategories = Array.from(new Set(categoriesList.map(c => c.description || "General").filter(Boolean)));
    const categories = distinctCategories.map(name => ({ id: name, name }));

    // Courses are the actual records in the Category table, linking to their parent Category
    const courses = categoriesList.map(c => ({
      id: c.id,
      name: c.name,
      categoryId: c.description || "General"
    }));

    // Sessions are mapped from LiveSession, linking directly to their Category ID
    const sessions = sessionsList.map(s => ({
      id: s.id,
      name: s.title,
      courseId: s.courseId || null
    }));

    return res.status(200).json({
      success: true,
      data: { categories, courses, sessions }
    });
  } catch (error) {
    console.error("getOfferTargets Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch campaign targets.",
      error: error.message
    });
  }
};

// 2. GET /api/admin/offer-campaigns
const getOfferCampaigns = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 10 } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const where = {};
    if (status) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { campaignName: { contains: search, mode: "insensitive" } },
        { offerTitle: { contains: search, mode: "insensitive" } }
      ];
    }

    const campaigns = await prisma.offerCampaign.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        campaignName: true,
        offerTitle: true,
        status: true,
        categoryIds: true,
        courseId: true,
        sessionId: true,
        recipientCount: true,
        sentCount: true,
        failedCount: true,
        validTill: true,
        sentAt: true,
        createdAt: true
      }
    });

    return res.status(200).json({
      success: true,
      data: campaigns
    });
  } catch (error) {
    console.error("getOfferCampaigns Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch offer campaigns.",
      error: error.message
    });
  }
};

// 3. POST /api/admin/offer-campaigns
const createOfferCampaign = async (req, res) => {
  try {
    const payload = req.body;

    // Validation checks with clear error messages
    if (!payload.campaignName) {
      return res.status(400).json({ success: false, message: "campaignName is required" });
    }
    if (!payload.offerTitle) {
      return res.status(400).json({ success: false, message: "offerTitle is required" });
    }
    if (!payload.discountType) {
      return res.status(400).json({ success: false, message: "discountType is required" });
    }
    if (payload.discountValue === undefined || payload.discountValue === "") {
      return res.status(400).json({ success: false, message: "discountValue is required" });
    }
    if (!payload.validTill) {
      return res.status(400).json({ success: false, message: "validTill is required" });
    }
    if (!payload.subject) {
      return res.status(400).json({ success: false, message: "subject is required" });
    }
    if (!payload.heading) {
      return res.status(400).json({ success: false, message: "heading is required" });
    }
    if (!payload.body) {
      return res.status(400).json({ success: false, message: "body is required" });
    }
    if (!payload.buttonText) {
      return res.status(400).json({ success: false, message: "buttonText is required" });
    }

    let categoryIds = payload.categoryIds;
    if (!categoryIds) {
      return res.status(400).json({ success: false, message: "categoryIds is required" });
    }
    if (typeof categoryIds === "string") {
      try {
        categoryIds = JSON.parse(categoryIds);
      } catch (e) {
        categoryIds = categoryIds.split(",").map(c => c.trim()).filter(Boolean);
      }
    }
    if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
      return res.status(400).json({ success: false, message: "categoryIds is required and must contain at least one category" });
    }

    // Sanitize optional target courseId/sessionId
    const cleanCourseId = (payload.courseId && payload.courseId !== "undefined" && payload.courseId !== "null" && payload.courseId.trim() !== "") ? payload.courseId.trim() : null;
    const cleanSessionId = (payload.sessionId && payload.sessionId !== "undefined" && payload.sessionId !== "null" && payload.sessionId.trim() !== "") ? payload.sessionId.trim() : null;

    // Validate categories, courses, and sessions exist and align
    const targetValidation = await validateCampaignTargets(categoryIds, cleanCourseId, cleanSessionId);
    if (!targetValidation.valid) {
      return res.status(400).json({
        success: false,
        message: targetValidation.message
      });
    }

    // Handle file upload if any
    let heroImageUrl = null;
    if (req.file) {
      heroImageUrl = req.file.path.replace(/\\/g, "/");
    } else if (payload.heroImage && payload.heroImage !== "undefined" && payload.heroImage !== "null") {
      heroImageUrl = payload.heroImage;
    }

    // Generate Campaign UUID and Button Link
    const campaignId = crypto.randomUUID();
    const buttonLink = generateButtonLink(campaignId, categoryIds, cleanCourseId, cleanSessionId);

    // Resolve estimated recipient count
    const recipients = await resolveRecipients({
      categoryIds,
      courseId: cleanCourseId,
      sessionId: cleanSessionId,
      audienceType: payload.audienceType || "all_students"
    });

    const statusToUse = (payload.status && ["draft", "ready", "sent"].includes(payload.status)) ? payload.status : "draft";
    const showLogoBool = payload.showLogo === true || payload.showLogo === "true" || payload.showLogo === undefined;

    const campaign = await prisma.offerCampaign.create({
      data: {
        id: campaignId,
        campaignName: sanitizePlainText(payload.campaignName),
        offerTitle: sanitizePlainText(payload.offerTitle),
        description: payload.description ? sanitizePlainText(payload.description) : null,
        discountType: payload.discountType,
        discountValue: parseFloat(payload.discountValue),
        validTill: new Date(payload.validTill),
        categoryIds,
        courseId: cleanCourseId,
        sessionId: cleanSessionId,
        audienceType: payload.audienceType || "all_students",
        subject: sanitizePlainText(payload.subject),
        heading: sanitizePlainText(payload.heading),
        body: sanitizeHtml(payload.body),
        buttonText: sanitizePlainText(payload.buttonText),
        buttonLink,
        showLogo: showLogoBool,
        heroImageUrl,
        status: statusToUse,
        recipientCount: recipients.length,
        createdByAdminId: req.user.id
      }
    });

    return res.status(201).json({
      success: true,
      data: { campaign }
    });
  } catch (error) {
    console.error("createOfferCampaign Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create offer campaign.",
      error: error.message
    });
  }
};

// 4. GET /api/admin/offer-campaigns/:id
const getOfferCampaignById = async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await prisma.offerCampaign.findUnique({
      where: { id }
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Offer campaign not found."
      });
    }

    return res.status(200).json({
      success: true,
      data: { campaign }
    });
  } catch (error) {
    console.error("getOfferCampaignById Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch offer campaign.",
      error: error.message
    });
  }
};

// 5. PATCH /api/admin/offer-campaigns/:id
const updateOfferCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.offerCampaign.findUnique({
      where: { id }
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Offer campaign not found."
      });
    }

    if (existing.status !== "draft" && existing.status !== "ready") {
      return res.status(400).json({
        success: false,
        message: "Campaign can only be updated if it is in draft or ready status."
      });
    }

    let payload = req.body;
    let categoryIds = payload.categoryIds;
    if (categoryIds && typeof categoryIds === "string") {
      try {
        categoryIds = JSON.parse(categoryIds);
      } catch (e) {
        categoryIds = categoryIds.split(",").map(c => c.trim()).filter(Boolean);
      }
    }

    // Compile update fields
    const updateData = {};
    if (payload.campaignName !== undefined) updateData.campaignName = sanitizePlainText(payload.campaignName);
    if (payload.offerTitle !== undefined) updateData.offerTitle = sanitizePlainText(payload.offerTitle);
    if (payload.description !== undefined) updateData.description = payload.description ? sanitizePlainText(payload.description) : null;
    if (payload.discountType !== undefined) updateData.discountType = payload.discountType;
    if (payload.discountValue !== undefined) updateData.discountValue = parseFloat(payload.discountValue);
    if (payload.validTill !== undefined) updateData.validTill = new Date(payload.validTill);
    if (payload.audienceType !== undefined) updateData.audienceType = payload.audienceType;
    if (payload.subject !== undefined) updateData.subject = sanitizePlainText(payload.subject);
    if (payload.heading !== undefined) updateData.heading = sanitizePlainText(payload.heading);
    if (payload.body !== undefined) updateData.body = sanitizeHtml(payload.body);
    if (payload.buttonText !== undefined) updateData.buttonText = sanitizePlainText(payload.buttonText);
    if (payload.showLogo !== undefined) updateData.showLogo = payload.showLogo === true || payload.showLogo === "true";
    if (payload.status !== undefined) {
      if (["draft", "ready", "sent"].includes(payload.status)) {
        updateData.status = payload.status;
      }
    }

    if (req.file) {
      updateData.heroImageUrl = req.file.path.replace(/\\/g, "/");
    } else if (payload.heroImage !== undefined) {
      updateData.heroImageUrl = (payload.heroImage === "null" || payload.heroImage === "undefined") ? null : payload.heroImage;
    }

    // If target settings changed, validate them, regenerate CTA link, and recount recipients
    const categoryIdsToUse = categoryIds !== undefined ? categoryIds : existing.categoryIds;
    const cleanCourseId = (payload.courseId !== undefined)
      ? ((payload.courseId && payload.courseId !== "undefined" && payload.courseId !== "null" && payload.courseId.trim() !== "") ? payload.courseId.trim() : null)
      : existing.courseId;
    const cleanSessionId = (payload.sessionId !== undefined)
      ? ((payload.sessionId && payload.sessionId !== "undefined" && payload.sessionId !== "null" && payload.sessionId.trim() !== "") ? payload.sessionId.trim() : null)
      : existing.sessionId;
    const audienceTypeToUse = payload.audienceType !== undefined ? payload.audienceType : existing.audienceType;

    if (
      categoryIds !== undefined ||
      payload.courseId !== undefined ||
      payload.sessionId !== undefined ||
      payload.audienceType !== undefined
    ) {
      const targetValidation = await validateCampaignTargets(categoryIdsToUse, cleanCourseId, cleanSessionId);
      if (!targetValidation.valid) {
        return res.status(400).json({
          success: false,
          message: targetValidation.message
        });
      }

      updateData.categoryIds = categoryIdsToUse;
      updateData.courseId = cleanCourseId;
      updateData.sessionId = cleanSessionId;

      // Regenerate Link
      updateData.buttonLink = generateButtonLink(id, categoryIdsToUse, cleanCourseId, cleanSessionId);

      // Recalculate estimated recipients
      const recipients = await resolveRecipients({
        categoryIds: categoryIdsToUse,
        courseId: cleanCourseId,
        sessionId: cleanSessionId,
        audienceType: audienceTypeToUse
      });
      updateData.recipientCount = recipients.length;
    }

    const updated = await prisma.offerCampaign.update({
      where: { id },
      data: updateData
    });

    return res.status(200).json({
      success: true,
      data: { campaign: updated }
    });
  } catch (error) {
    console.error("updateOfferCampaign Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update offer campaign.",
      error: error.message
    });
  }
};

// 6. DELETE /api/admin/offer-campaigns/:id
const deleteOfferCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.offerCampaign.findUnique({
      where: { id }
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Offer campaign not found."
      });
    }

    if (existing.status !== "draft" && existing.status !== "ready") {
      return res.status(400).json({
        success: false,
        message: "Sent, failed, or active sending campaigns cannot be deleted."
      });
    }

    await prisma.offerCampaign.delete({
      where: { id }
    });

    return res.status(200).json({
      success: true,
      message: "Campaign deleted successfully."
    });
  } catch (error) {
    console.error("deleteOfferCampaign Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete offer campaign.",
      error: error.message
    });
  }
};

// 7. POST /api/admin/offer-campaigns/:id/preview
const previewOfferCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await prisma.offerCampaign.findUnique({
      where: { id }
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Offer campaign not found."
      });
    }

    const recipients = await resolveRecipients({
      categoryIds: campaign.categoryIds,
      courseId: campaign.courseId,
      sessionId: campaign.sessionId,
      audienceType: campaign.audienceType
    });

    const html = renderCampaignHtml(campaign);

    return res.status(200).json({
      success: true,
      data: {
        recipientCount: recipients.length,
        buttonLink: campaign.buttonLink,
        html
      }
    });
  } catch (error) {
    console.error("previewOfferCampaign Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to render preview.",
      error: error.message
    });
  }
};

// 8. POST /api/admin/offer-campaigns/:id/send
const sendOfferCampaign = async (req, res) => {
  try {
    const { id } = req.params;

    const campaign = await prisma.offerCampaign.findUnique({
      where: { id }
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Offer campaign not found."
      });
    }

    if (campaign.status === "sending" || campaign.status === "sent") {
      return res.status(400).json({
        success: false,
        message: "Campaign has already been sent or is currently sending."
      });
    }

    // Set campaign status to sending
    await prisma.offerCampaign.update({
      where: { id },
      data: { status: "sending" }
    });

    // Resolve recipients
    const recipients = await resolveRecipients({
      categoryIds: campaign.categoryIds,
      courseId: campaign.courseId,
      sessionId: campaign.sessionId,
      audienceType: campaign.audienceType
    });

    if (recipients.length === 0) {
      const updatedCampaign = await prisma.offerCampaign.update({
        where: { id },
        data: {
          status: "failed",
          recipientCount: 0,
          sentCount: 0,
          failedCount: 0
        }
      });
      return res.status(400).json({
        success: false,
        message: "No matching student recipients resolved for this campaign targeting.",
        data: { campaign: updatedCampaign }
      });
    }

    // Create delivery logs (pending)
    const deliveriesData = recipients.map(r => ({
      campaignId: id,
      studentId: r.id,
      email: r.email,
      status: "pending"
    }));

    await prisma.offerCampaignDelivery.createMany({
      data: deliveriesData
    });

    // Fetch newly created delivery records to map them to students
    const deliveries = await prisma.offerCampaignDelivery.findMany({
      where: { campaignId: id }
    });

    // Process delivery batches of 10
    let sentCount = 0;
    let failedCount = 0;
    const BATCH_SIZE = 10;

    for (let i = 0; i < deliveries.length; i += BATCH_SIZE) {
      const batch = deliveries.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (delivery) => {
        try {
          const mailResponse = await sendCampaignEmail(delivery.email, campaign);
          
          let providerMessageId = null;
          if (mailResponse && mailResponse.messageId) {
            providerMessageId = mailResponse.messageId;
          }

          await prisma.offerCampaignDelivery.update({
            where: { id: delivery.id },
            data: {
              status: "sent",
              providerMessageId,
              sentAt: new Date()
            }
          });
          sentCount++;
        } catch (err) {
          await prisma.offerCampaignDelivery.update({
            where: { id: delivery.id },
            data: {
              status: "failed",
              errorMessage: err.message || "Unknown SMTP Error"
            }
          });
          failedCount++;
          console.error(`[CAMPAIGN] Failed to send email to ${delivery.email}:`, err.message);
        }
      });

      await Promise.all(batchPromises);
    }

    // Calculate final status: 'sent' if mostly successful, 'failed' if all failed.
    const finalStatus = (sentCount > 0) ? "sent" : "failed";

    const updatedCampaign = await prisma.offerCampaign.update({
      where: { id },
      data: {
        status: finalStatus,
        recipientCount: recipients.length,
        sentCount,
        failedCount,
        sentAt: new Date()
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        campaign: updatedCampaign
      }
    });
  } catch (error) {
    console.error("sendOfferCampaign Error:", error);
    try {
      await prisma.offerCampaign.update({
        where: { id: req.params.id },
        data: { status: "failed" }
      });
    } catch (dbErr) {
      // Ignore DB errors on fallback update
    }
    return res.status(500).json({
      success: false,
      message: "Critical error encountered during campaign dispatch.",
      error: error.message
    });
  }
};

// 9. GET /api/admin/offer-campaigns/:id/deliveries
const getOfferCampaignDeliveries = async (req, res) => {
  try {
    const { id } = req.params;
    const deliveries = await prisma.offerCampaignDelivery.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        studentId: true,
        email: true,
        status: true,
        providerMessageId: true,
        errorMessage: true,
        sentAt: true
      }
    });

    return res.status(200).json({
      success: true,
      data: deliveries
    });
  } catch (error) {
    console.error("getOfferCampaignDeliveries Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch deliveries logs.",
      error: error.message
    });
  }
};

// ─── Student Click Tracking ──────────────────────────────────────────────────

// 10. POST /api/student/offer-campaigns/:campaignId/click
const trackOfferCampaignClick = async (req, res) => {
  try {
    const { campaignId } = req.params;
    let { targetType, targetId } = req.body;

    const campaign = await prisma.offerCampaign.findUnique({
      where: { id: campaignId }
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found."
      });
    }

    // Try to resolve studentId and email from JWT Authorization header if available
    let studentId = null;
    let email = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        studentId = decoded.id;
        
        // Lookup student details
        const student = await prisma.user.findUnique({
          where: { id: studentId },
          select: { email: true }
        });
        if (student) {
          email = student.email;
        }
      } catch (err) {
        // Silently catch token errors to support anonymous clicks
      }
    }

    // Fallback targetType and targetId from campaign if missing in request payload
    if (!targetType) {
      if (campaign.sessionId) {
        targetType = "session";
        targetId = campaign.sessionId;
      } else if (campaign.courseId) {
        targetType = "course";
        targetId = campaign.courseId;
      } else if (campaign.categoryIds.length === 1) {
        targetType = "category";
        targetId = campaign.categoryIds[0];
      } else {
        targetType = "category";
        targetId = null;
      }
    }

    // Log the campaign click event
    await prisma.offerCampaignClick.create({
      data: {
        campaignId,
        studentId,
        email,
        targetType,
        targetId: targetId || null,
        userAgent: req.headers["user-agent"] || null,
        ipAddress: req.ip || null
      }
    });

    return res.status(200).json({
      success: true
    });
  } catch (error) {
    console.error("trackOfferCampaignClick Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to record click event.",
      error: error.message
    });
  }
};

module.exports = {
  getOfferTargets,
  getOfferCampaigns,
  createOfferCampaign,
  getOfferCampaignById,
  updateOfferCampaign,
  deleteOfferCampaign,
  previewOfferCampaign,
  sendOfferCampaign,
  getOfferCampaignDeliveries,
  trackOfferCampaignClick
};
