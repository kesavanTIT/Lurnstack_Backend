const prisma = require("../config/db");
const razorpay = require("../config/razorpay");

// ─────────────────────────────────────────────
// @desc    List all sessions with pricing
// @route   GET /api/admin/sessions
// ─────────────────────────────────────────────
const getAdminSessions = async (req, res) => {
  try {
    const sessions = await prisma.liveSession.findMany({
      include: {
        trainer: { select: { id: true, fullName: true, email: true } },
        pricing: true
      },
      orderBy: { createdAt: "desc" }
    });

    // Normalize: expose trainerName at the top level for frontend convenience
    const formatted = sessions.map((s) => ({
      ...s,
      trainerName: s.trainer?.fullName || "-"
    }));

    return res.status(200).json({ success: true, data: formatted });
  } catch (error) {
    console.error("getAdminSessions error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// @desc    Get session details by ID (including pricing)
// @route   GET /api/admin/sessions/:sessionId
// ─────────────────────────────────────────────
const getAdminSessionById = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: {
        trainer: { select: { id: true, fullName: true, email: true } },
        pricing: true
      }
    });
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found." });
    }

    // Normalize: expose trainerName at the top level for frontend convenience
    const formatted = { ...session, trainerName: session.trainer?.fullName || "-" };

    return res.status(200).json({ success: true, data: formatted });
  } catch (error) {
    console.error("getAdminSessionById error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// @desc    Configure or update session pricing
// @route   PATCH /api/admin/sessions/:sessionId/pricing
// ─────────────────────────────────────────────
const updateSessionPricing = async (req, res) => {
  try {
    const { sessionId } = req.params;
    // Accept both camelCase variants: trainerSharePercent (legacy) and trainerSharePercentage (frontend)
    const {
      amountPaise,
      currency,
      trainerSharePercent: _trainerSharePercent,
      trainerSharePercentage: _trainerSharePercentage,
      platformCommissionPercent: _platformCommissionPercent,
      platformCommissionPercentage: _platformCommissionPercentage,
    } = req.body;

    const trainerSharePercent = _trainerSharePercent ?? _trainerSharePercentage;
    const platformCommissionPercent = _platformCommissionPercent ?? _platformCommissionPercentage;

    if (amountPaise === undefined || trainerSharePercent === undefined || platformCommissionPercent === undefined) {
      return res.status(400).json({
        success: false,
        message: "amountPaise, trainerSharePercent(age), and platformCommissionPercent(age) are required.",
      });
    }

    if (Math.round(parseFloat(trainerSharePercent) + parseFloat(platformCommissionPercent)) !== 100) {
      return res.status(400).json({ success: false, message: "Shares must add up to 100%." });
    }

    const adminId = parseInt(req.user.id);

    const updatedSession = await prisma.liveSession.update({
      where: { id: sessionId },
      data: {
        priceInPaise: parseInt(amountPaise),
        trainerSharePercentage: parseFloat(trainerSharePercent),
        platformCommissionPercentage: parseFloat(platformCommissionPercent),
      },
    });

    // Also update the SessionPricing relation for backwards compatibility if needed, 
    // or just rely on LiveSession fields going forward. We will upsert to keep it synced.
    await prisma.sessionPricing.upsert({
      where: { sessionId },
      update: {
        amountPaise: parseInt(amountPaise),
        currency: currency || "INR",
        trainerSharePercent: parseFloat(trainerSharePercent),
        platformCommissionPercent: parseFloat(platformCommissionPercent),
        createdByAdminId: adminId,
      },
      create: {
        sessionId,
        amountPaise: parseInt(amountPaise),
        currency: currency || "INR",
        trainerSharePercent: parseFloat(trainerSharePercent),
        platformCommissionPercent: parseFloat(platformCommissionPercent),
        createdByAdminId: adminId,
        isActive: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Session pricing updated.",
      data: {
        sessionId: updatedSession.id,
        amountPaise: updatedSession.priceInPaise,
        currency: currency || "INR",
        // Expose both name variants so frontend always resolves the field
        trainerSharePercent: updatedSession.trainerSharePercentage,
        trainerSharePercentage: updatedSession.trainerSharePercentage,
        platformCommissionPercent: updatedSession.platformCommissionPercentage,
        platformCommissionPercentage: updatedSession.platformCommissionPercentage,
      },
    });
  } catch (error) {
    console.error("updateSessionPricing error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// @desc    List all student payments
// @route   GET /api/admin/payments
// ─────────────────────────────────────────────
const getAdminPayments = async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      include: {
        student: { select: { id: true, fullName: true, email: true } },
        session: { select: { id: true, title: true } },
        booking: true
      },
      orderBy: { createdAt: "desc" }
    });
    return res.status(200).json({ success: true, data: payments });
  } catch (error) {
    console.error("getAdminPayments error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// @desc    Get details for a specific payment
// @route   GET /api/admin/payments/:paymentId
// ─────────────────────────────────────────────
const getAdminPaymentById = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        student: { select: { id: true, fullName: true, email: true } },
        session: { select: { id: true, title: true } },
        booking: true
      }
    });
    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found." });
    }
    return res.status(200).json({ success: true, data: payment });
  } catch (error) {
    console.error("getAdminPaymentById error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// @desc    Compute revenue breakdown for a session
// @route   GET /api/admin/sessions/:sessionId/revenue
// ─────────────────────────────────────────────
const getSessionRevenue = async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Fetch session with trainer info and pricing in one query
    const session = await prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: {
        trainer: { select: { id: true, fullName: true, email: true } },
        pricing: true,
      },
    });

    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found." });
    }

    if (session.priceInPaise === null && !session.pricing) {
      // Return zero-revenue structure instead of 404 so the frontend
      // can show "No pricing configured" rather than a generic error.
      return res.status(200).json({
        success: true,
        noPricing: true,
        message: "Pricing not configured for this session.",
        data: {
          sessionId: session.id,
          classTitle: session.classTitle || session.title || session.courseTitle || "Untitled Session",
          trainerName: session.trainer?.fullName || "-",
          trainerEmail: session.trainer?.email || "-",
          grossRevenue: 0,
          trainerEarning: 0,
          platformEarning: 0,
          grossRevenuePaise: 0,
          trainerEarningPaise: 0,
          platformEarningPaise: 0,
          sessionPricePaise: 0,
          sessionPrice: 0,
          currency: "INR",
          trainerSharePercentage: 50,
          trainerSharePercent: 50,
          platformCommissionPercentage: 50,
          platformCommissionPercent: 50,
          paidStudentCount: 0,
          payments: [],
        },
      });
    }

    const sessionPricePaise = session.priceInPaise !== null ? session.priceInPaise : session.pricing?.amountPaise || 0;
    const currency = session.pricing?.currency || "INR";
    const trainerSharePercent = session.trainerSharePercentage !== null ? session.trainerSharePercentage : session.pricing?.trainerSharePercent || 50;
    const platformCommissionPercent = session.platformCommissionPercentage !== null ? session.platformCommissionPercentage : session.pricing?.platformCommissionPercent || 50;

    // Fetch all captured payments for this session
    // NOTE: orderBy on nullable paidAt uses nulls-last to avoid query errors
    const payments = await prisma.payment.findMany({
      where: {
        sessionId,
        status: "captured",
      },
      include: {
        student: { select: { id: true, fullName: true, email: true } },
        booking: { select: { id: true, sessionDate: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Aggregate revenue figures
    const grossRevenuePaise = payments.reduce((sum, p) => sum + p.amountPaise, 0);

    const trainerEarningPaise = Math.round(grossRevenuePaise * (trainerSharePercent / 100));
    const platformEarningPaise = grossRevenuePaise - trainerEarningPaise;

    // Count unique students who have paid (deduplicated by studentId)
    const uniquePaidStudentIds = new Set(payments.map((p) => p.studentId));
    const paidStudentCount = uniquePaidStudentIds.size;

    // Determine class title: prefer classTitle > title fields on the session
    const classTitle =
      session.classTitle || session.title || session.courseTitle || "Untitled Session";

    return res.status(200).json({
      success: true,
      data: {
        sessionId: session.id,
        classTitle,
        trainerName: session.trainer?.fullName || "-",
        trainerEmail: session.trainer?.email || "-",

        // Revenue figures in rupees (divide paise by 100)
        grossRevenue: grossRevenuePaise / 100,
        trainerEarning: trainerEarningPaise / 100,
        platformEarning: platformEarningPaise / 100,

        // Also expose raw paise values for precision
        grossRevenuePaise,
        trainerEarningPaise,
        platformEarningPaise,

        // Pricing config — expose both name variants for frontend compatibility
        sessionPricePaise: sessionPricePaise,
        sessionPrice: sessionPricePaise / 100,
        currency: currency,
        trainerSharePercentage: trainerSharePercent,
        trainerSharePercent,
        platformCommissionPercentage: platformCommissionPercent,
        platformCommissionPercent,

        // Student count
        paidStudentCount,

        // Full payments list
        payments,
      },
    });
  } catch (error) {
    console.error("getSessionRevenue error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// @desc    List all trainer earnings records
// @route   GET /api/admin/trainer-earnings
// ─────────────────────────────────────────────
const getAdminTrainerEarnings = async (req, res) => {
  try {
    const earnings = await prisma.trainerEarning.findMany({
      include: {
        trainer: { select: { id: true, fullName: true, email: true } },
        session: { select: { id: true, title: true } },
        booking: true
      },
      orderBy: { createdAt: "desc" }
    });
    return res.status(200).json({ success: true, data: earnings });
  } catch (error) {
    console.error("getAdminTrainerEarnings error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// @desc    Mark a trainer earning record as paid
// @route   POST /api/admin/trainer-earnings/:earningId/mark-paid
// ─────────────────────────────────────────────
const markTrainerEarningPaid = async (req, res) => {
  try {
    const { earningId } = req.params;
    const earning = await prisma.trainerEarning.findUnique({
      where: { id: earningId }
    });

    if (!earning) {
      return res.status(404).json({ success: false, message: "Trainer earning record not found." });
    }

    const updated = await prisma.trainerEarning.update({
      where: { id: earningId },
      data: {
        status: "paid",
        paidAt: new Date()
      }
    });

    return res.status(200).json({ success: true, message: "Trainer earning marked as paid.", data: updated });
  } catch (error) {
    console.error("markTrainerEarningPaid error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// @desc    Hold or unhold trainer earning status
// @route   POST /api/admin/trainer-earnings/:earningId/hold
// ─────────────────────────────────────────────
const toggleTrainerEarningHold = async (req, res) => {
  try {
    const { earningId } = req.params;
    const earning = await prisma.trainerEarning.findUnique({
      where: { id: earningId }
    });

    if (!earning) {
      return res.status(404).json({ success: false, message: "Trainer earning record not found." });
    }

    const nextStatus = earning.status === "on_hold" ? "payable" : "on_hold";
    const updated = await prisma.trainerEarning.update({
      where: { id: earningId },
      data: { status: nextStatus }
    });

    return res.status(200).json({ success: true, message: `Trainer earning status set to ${nextStatus}.`, data: updated });
  } catch (error) {
    console.error("toggleTrainerEarningHold error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// @desc    Refund payment via Razorpay API
// @route   POST /api/admin/payments/:paymentId/refund
// ─────────────────────────────────────────────
const refundPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { booking: true }
    });

    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found." });
    }

    if (payment.status === "refunded") {
      return res.status(400).json({ success: false, message: "Payment has already been refunded." });
    }

    if (!payment.razorpayPaymentId) {
      return res.status(400).json({ success: false, message: "Cannot refund a payment without a Razorpay payment ID." });
    }

    // Call Razorpay Refund API
    const refund = await razorpay.payments.refund(payment.razorpayPaymentId, {
      amount: payment.amountPaise,
      notes: {
        paymentId: payment.id,
        bookingId: payment.bookingId
      }
    });

    // Transactionally update statuses
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: "refunded" }
      });

      await tx.booking.update({
        where: { id: payment.bookingId },
        data: { status: "refunded" }
      });

      await tx.trainerEarning.updateMany({
        where: { bookingId: payment.bookingId },
        data: { status: "cancelled" }
      });
    });

    return res.status(200).json({ success: true, message: "Payment refunded successfully.", razorpayRefundId: refund.id });
  } catch (error) {
    console.error("refundPayment error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to process refund." });
  }
};

// ─────────────────────────────────────────────
// @desc    Update global payment settings (Simulated Configuration)
// @route   PATCH /api/admin/payment-settings
// ─────────────────────────────────────────────
const updatePaymentSettings = async (req, res) => {
  try {
    const { defaultTrainerSharePercent, defaultPlatformCommissionPercent, currency } = req.body;
    console.log("Mock Payment Settings Updated:", { defaultTrainerSharePercent, defaultPlatformCommissionPercent, currency });
    
    return res.status(200).json({
      success: true,
      message: "Payment settings updated.",
      data: {
        defaultTrainerSharePercent: defaultTrainerSharePercent || 50,
        defaultPlatformCommissionPercent: defaultPlatformCommissionPercent || 50,
        currency: currency || "INR"
      }
    });
  } catch (error) {
    console.error("updatePaymentSettings error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

module.exports = {
  getAdminSessions,
  getAdminSessionById,
  updateSessionPricing,
  getAdminPayments,
  getAdminPaymentById,
  getSessionRevenue,
  getAdminTrainerEarnings,
  markTrainerEarningPaid,
  toggleTrainerEarningHold,
  refundPayment,
  updatePaymentSettings
};
