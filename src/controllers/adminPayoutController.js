const prisma = require("../config/db");
const { decrypt, maskAccountNumber } = require("../utils/encryption");

// Helper to get boundary start date for cycle clearing in Asia/Kolkata timezone
const getBoundaryStartDate = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "numeric",
    year: "numeric"
  });
  const parts = formatter.formatToParts(date);
  const partMap = {};
  parts.forEach(p => { partMap[p.type] = p.value; });
  
  const day = parseInt(partMap.day, 10);
  const month = parseInt(partMap.month, 10);
  const year = parseInt(partMap.year, 10);
  
  if (day <= 15) {
    return new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+05:30`);
  } else {
    return new Date(`${year}-${String(month).padStart(2, '0')}-16T00:00:00+05:30`);
  }
};

// 1. GET /api/admin/trainer-earnings
const getAdminTrainerEarnings = async (req, res) => {
  try {
    const { trainerId, sessionId, status, from, to, search, groupBy } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const where = {};
    if (trainerId) where.trainerId = parseInt(trainerId, 10);
    if (sessionId) where.sessionId = sessionId;
    if (status) where.status = status;
    
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    if (search) {
      where.OR = [
        { trainerName: { contains: search, mode: "insensitive" } },
        { trainerEmail: { contains: search, mode: "insensitive" } },
        { sessionTitle: { contains: search, mode: "insensitive" } }
      ];
    }

    if (groupBy === "session") {
      // Fetch all matching earnings to group them in memory
      const earnings = await prisma.trainerEarning.findMany({
        where,
        include: {
          booking: {
            include: {
              student: {
                select: {
                  id: true,
                  fullName: true
                }
              }
            }
          },
          payment: {
            include: {
              student: {
                select: {
                  id: true,
                  fullName: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: "desc" }
      });

      const groups = {};
      for (const e of earnings) {
        // Resolve stable sessionId
        let resolvedSessionId = e.sessionId;
        if (!resolvedSessionId && e.session && e.session.id) {
          resolvedSessionId = e.session.id;
        }
        if (!resolvedSessionId && e.booking && e.booking.sessionId) {
          resolvedSessionId = e.booking.sessionId;
        }
        if (!resolvedSessionId && e.booking && e.booking.liveSessionId) {
          resolvedSessionId = e.booking.liveSessionId;
        }
        if (!resolvedSessionId) {
          const normalizedTitle = String(e.sessionTitle || "Unknown Session")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "-");
          resolvedSessionId = `fallback-${e.trainerId}-${normalizedTitle}`;
        }

        if (!groups[resolvedSessionId]) {
          groups[resolvedSessionId] = {
            sessionId: resolvedSessionId,
            sessionTitle: e.sessionTitle || "Live Session",
            trainerId: e.trainerId,
            trainerName: e.trainerName || "Trainer",
            trainerEmail: e.trainerEmail || "",
            paidStudentCount: 0,
            sessionPricePaise: e.sessionPricePaise || 0,
            grossRevenuePaise: 0,
            trainerSharePercentage: e.trainerSharePercentage || 50,
            platformCommissionPercentage: e.platformSharePercentage || 50,
            trainerEarningPaise: 0,
            platformEarningPaise: 0,
            refundAdjustmentPaise: 0,
            finalPayablePaise: 0,
            payoutStatus: "unpaid",
            createdAt: e.createdAt,
            updatedAt: e.updatedAt,
            earningRows: [],
            payoutRequestIds: new Set(),
            rawEarnings: []
          };
        }

        const group = groups[resolvedSessionId];
        group.rawEarnings.push(e);

        const excludedStatuses = ["rejected", "adjusted", "pending_session_completion", "failed", "cancelled", "on_hold"];
        if (!excludedStatuses.includes(e.status)) {
          group.paidStudentCount += 1;
        }

        group.grossRevenuePaise += e.grossRevenuePaise || 0;
        group.trainerEarningPaise += e.trainerEarningPaise || 0;
        group.platformEarningPaise += e.platformEarningPaise || 0;
        group.refundAdjustmentPaise += e.refundAdjustmentPaise || 0;
        group.finalPayablePaise += e.finalPayablePaise || 0;

        if (e.payoutRequestId) {
          group.payoutRequestIds.add(e.payoutRequestId);
        }

        if (new Date(e.createdAt) < new Date(group.createdAt)) {
          group.createdAt = e.createdAt;
        }
        if (new Date(e.updatedAt) > new Date(group.updatedAt)) {
          group.updatedAt = e.updatedAt;
        }

        const studentId = e.booking?.studentId || e.payment?.studentId || null;
        const studentName = e.booking?.student?.fullName || e.payment?.student?.fullName || "Student";
        const paymentId = e.paymentId || (e.booking && e.booking.payments?.[0]?.id) || null;

        group.earningRows.push({
          id: e.id,
          studentId,
          studentName,
          paymentId,
          amountPaidPaise: e.grossRevenuePaise || 0,
          trainerEarningPaise: e.trainerEarningPaise || 0,
          refundAdjustmentPaise: e.refundAdjustmentPaise || 0,
          status: e.status,
          createdAt: e.createdAt
        });
      }

      const trainerIds = Array.from(new Set(Object.values(groups).map(g => g.trainerId).filter(Boolean)));
      const allTrainerEarnings = await prisma.trainerEarning.findMany({
        where: { trainerId: { in: trainerIds } }
      });
      const allTrainerPayouts = await prisma.trainerPayoutRequest.findMany({
        where: { trainerId: { in: trainerIds } }
      });
      const trainerStatsMap = {};
      for (const tId of trainerIds) {
        const tEarnings = allTrainerEarnings.filter(e => e.trainerId === tId);
        const tPayouts = allTrainerPayouts.filter(p => p.trainerId === tId);
        const excludedStatuses = ["rejected", "adjusted", "pending_session_completion", "failed", "cancelled", "on_hold"];
        const totalEarnedPaise = tEarnings
          .filter(e => !excludedStatuses.includes(e.status))
          .reduce((sum, e) => sum + (e.finalPayablePaise || 0), 0);
        const totalPaidPaise = tPayouts
          .filter(p => p.status === "paid")
          .reduce((sum, p) => sum + (p.requestedAmountPaise || 0), 0);
        trainerStatsMap[tId] = {
          totalEarnedPaise,
          paidAmountPaise: totalPaidPaise,
          balancePayablePaise: Math.max(totalEarnedPaise - totalPaidPaise, 0)
        };
      }

      // Collect all unique payoutRequestIds across all groups
      const allPayoutRequestIds = new Set();
      for (const group of Object.values(groups)) {
        for (const id of group.payoutRequestIds) {
          allPayoutRequestIds.add(id);
        }
      }

      // Query all associated payout requests and their histories
      const payoutRequests = await prisma.trainerPayoutRequest.findMany({
        where: {
          id: { in: Array.from(allPayoutRequestIds) }
        },
        include: {
          history: true
        }
      });
      const payoutRequestsMap = new Map(payoutRequests.map(pr => [pr.id, pr]));

      const statusPriority = ["processing", "approved", "requested", "unpaid", "paid", "rejected", "adjusted", "on_hold", "cancelled", "failed", "pending_session_completion"];

      // Map group structures to the final output list
      const sessionEarningsList = Object.values(groups).map(group => {
        // Determine group payout status
        const statuses = group.rawEarnings.map(re => re.status);
        let resolvedPayoutStatus = "unpaid";
        for (const pStatus of statusPriority) {
          if (statuses.includes(pStatus)) {
            resolvedPayoutStatus = pStatus;
            break;
          }
        }
        group.payoutStatus = resolvedPayoutStatus;

        // Build history timeline
        const historyList = [];
        for (const e of group.rawEarnings) {
          historyList.push({
            id: `${e.id}-created`,
            type: "earning_created",
            amountPaise: e.trainerEarningPaise || 0,
            status: e.status,
            note: "Earning created from student booking",
            createdAt: e.createdAt,
            adminName: null
          });

          if (e.refundAdjustmentPaise !== 0 || e.status === "adjusted") {
            historyList.push({
              id: `${e.id}-adjusted`,
              type: "refund_adjusted",
              amountPaise: e.refundAdjustmentPaise || 0,
              status: e.status,
              note: "Refund adjustment applied",
              createdAt: e.updatedAt,
              adminName: null
            });
          }
        }

        for (const prId of group.payoutRequestIds) {
          const pr = payoutRequestsMap.get(prId);
          if (pr) {
            const sessionEarningsInPr = group.rawEarnings.filter(re => re.payoutRequestId === prId);
            const amountPaise = sessionEarningsInPr.reduce((sum, re) => sum + (re.finalPayablePaise || 0), 0);

            if (pr.history && pr.history.length > 0) {
              for (const h of pr.history) {
                let type = "payout_requested";
                if (h.action === "approved") type = "payout_approved";
                else if (h.action === "rejected") type = "rejected";
                else if (h.action === "processing") type = "processing";
                else if (h.action === "paid") type = "paid";

                historyList.push({
                  id: h.id,
                  type,
                  amountPaise,
                  status: h.newStatus,
                  note: h.note,
                  createdAt: h.createdAt,
                  adminName: h.adminName
                });
              }
            }
          }
        }

        // Sort history descending (latest first)
        historyList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        group.history = historyList;

        const stats = trainerStatsMap[group.trainerId] || {
          totalEarnedPaise: group.finalPayablePaise,
          paidAmountPaise: 0,
          balancePayablePaise: group.finalPayablePaise
        };
        group.paidAmountPaise = stats.paidAmountPaise;
        group.balancePayablePaise = stats.balancePayablePaise;

        // Cleanup temporary properties
        const { payoutRequestIds, rawEarnings, ...rest } = group;
        return rest;
      });

      // Sort sessions by latest createdAt descending
      sessionEarningsList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // In-memory pagination
      const total = sessionEarningsList.length;
      const totalPages = Math.ceil(total / limit);
      const paginatedData = sessionEarningsList.slice(skip, skip + limit);

      return res.status(200).json({
        success: true,
        data: paginatedData,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      });
    }

    const total = await prisma.trainerEarning.count({ where });
    const totalPages = Math.ceil(total / limit);

    const earnings = await prisma.trainerEarning.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit
    });

    return res.status(200).json({
      success: true,
      data: earnings,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error("getAdminTrainerEarnings error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// 2. GET /api/admin/trainer-earnings/:earningId
const getAdminTrainerEarningById = async (req, res) => {
  try {
    const { earningId } = req.params;
    const earning = await prisma.trainerEarning.findUnique({
      where: { id: earningId }
    });

    if (!earning) {
      return res.status(404).json({ success: false, message: "Earning record not found." });
    }

    return res.status(200).json({ success: true, data: earning });
  } catch (error) {
    console.error("getAdminTrainerEarningById error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// 3. GET /api/admin/sessions
const getAdminSessionsPricingRef = async (req, res) => {
  try {
    const { search, trainerId, pricingState, from, to } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const where = {};
    if (trainerId) where.trainerId = parseInt(trainerId, 10);
    if (pricingState) where.pricingState = pricingState;

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { trainer: { fullName: { contains: search, mode: "insensitive" } } }
      ];
    }

    const total = await prisma.liveSession.count({ where });
    const totalPages = Math.ceil(total / limit);

    const sessions = await prisma.liveSession.findMany({
      where,
      include: {
        trainer: { select: { fullName: true } },
        bookings: {
          where: { status: "paid" }
        }
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit
    });

    const formatted = sessions.map(s => {
      const isFree = s.pricingState === "FREE" || s.priceInPaise === 0;
      return {
        id: s.id,
        sessionId: s.id,
        title: s.title,
        sessionTitle: s.title,
        classTitle: s.title,
        trainerId: s.trainerId,
        trainerName: s.trainer?.fullName || "-",
        instructor: s.trainer?.fullName || "-",
        priceInPaise: isFree ? 0 : (s.priceInPaise || 0),
        amountPaise: isFree ? 0 : (s.priceInPaise || 0),
        price: isFree ? 0 : (s.priceInPaise || 0),
        trainerSharePercentage: s.trainerSharePercentage,
        platformCommissionPercentage: s.platformCommissionPercentage,
        paidStudentCount: s.bookings.length,
        pricingState: isFree ? "FREE" : s.pricingState,
        publishState: s.publishState,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      };
    });

    return res.status(200).json({
      success: true,
      data: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error("getAdminSessionsPricingRef error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// 4. PATCH /api/admin/sessions/:sessionId/pricing
const updateAdminSessionPricing = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { priceInPaise, trainerSharePercentage, platformCommissionPercentage, currency } = req.body;

    if (priceInPaise === undefined || trainerSharePercentage === undefined) {
      return res.status(400).json({
        success: false,
        message: "priceInPaise and trainerSharePercentage are required."
      });
    }

    const trainerShare = parseFloat(trainerSharePercentage);
    const platformShare = platformCommissionPercentage !== undefined 
      ? parseFloat(platformCommissionPercentage)
      : (100 - trainerShare);

    if (Math.round(trainerShare + platformShare) !== 100) {
      return res.status(400).json({ success: false, message: "Shares must add up to 100%." });
    }

    const finalPrice = parseInt(priceInPaise, 10);
    const pricingState = finalPrice === 0 ? "FREE" : "PRICED";
    const adminId = parseInt(req.user.id, 10);

    const session = await prisma.liveSession.update({
      where: { id: sessionId },
      data: {
        priceInPaise: finalPrice,
        trainerSharePercentage: trainerShare,
        platformCommissionPercentage: platformShare,
        pricingState
      }
    });

    await prisma.sessionPricing.upsert({
      where: { sessionId },
      update: {
        amountPaise: finalPrice,
        currency: currency || "INR",
        trainerSharePercent: trainerShare,
        platformCommissionPercent: platformShare,
        createdByAdminId: adminId
      },
      create: {
        sessionId,
        amountPaise: finalPrice,
        currency: currency || "INR",
        trainerSharePercent: trainerShare,
        platformCommissionPercent: platformShare,
        createdByAdminId: adminId
      }
    });

    return res.status(200).json({
      success: true,
      message: "Session pricing updated successfully.",
      data: session
    });
  } catch (error) {
    console.error("updateAdminSessionPricing error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// 5. GET /api/admin/trainer-payout-accounts
const getAdminTrainerPayoutAccounts = async (req, res) => {
  try {
    const { status, lockState, search } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const where = {};
    if (status) where.status = status;
    if (lockState) where.isLocked = lockState === "locked";

    if (search) {
      where.OR = [
        { trainer: { fullName: { contains: search, mode: "insensitive" } } },
        { trainer: { email: { contains: search, mode: "insensitive" } } },
        { bankName: { contains: search, mode: "insensitive" } },
        { upiId: { contains: search, mode: "insensitive" } },
        { pan: { contains: search, mode: "insensitive" } }
      ];
    }

    const total = await prisma.trainerPayoutAccount.count({ where });
    const totalPages = Math.ceil(total / limit);

    const accounts = await prisma.trainerPayoutAccount.findMany({
      where,
      include: { trainer: { select: { fullName: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit
    });

    const formatted = accounts.map(acc => {
      const decrypted = decrypt(acc.accountNumber);
      const masked = maskAccountNumber(decrypted);

      return {
        id: acc.id,
        trainerId: acc.trainerId,
        trainerName: acc.trainer?.fullName || "-",
        email: acc.trainer?.email || "",
        accountHolderName: acc.accountHolderName,
        bankName: acc.bankName,
        maskedAccountNumber: masked,
        accountNumberLast4: acc.accountNumberLast4,
        ifsc: acc.ifsc,
        upiId: acc.upiId,
        pan: acc.pan,
        phoneNumber: acc.phoneNumber,
        status: acc.status,
        isLocked: acc.isLocked,
        createdAt: acc.createdAt,
        updatedAt: acc.updatedAt
      };
    });

    return res.status(200).json({
      success: true,
      data: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error("getAdminTrainerPayoutAccounts error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// 6. GET /api/admin/trainer-payout-accounts/:accountId
const getAdminTrainerPayoutAccountById = async (req, res) => {
  try {
    const { accountId } = req.params;
    const account = await prisma.trainerPayoutAccount.findUnique({
      where: { id: accountId },
      include: { trainer: { select: { fullName: true, email: true } } }
    });

    if (!account) {
      return res.status(404).json({ success: false, message: "Payout account not found." });
    }

    const decrypted = decrypt(account.accountNumber);
    const masked = maskAccountNumber(decrypted);

    const history = await prisma.trainerPayoutAccountHistory.findMany({
      where: { payoutAccountId: accountId },
      orderBy: { createdAt: "desc" }
    });

    const activePayoutRequest = await prisma.trainerPayoutRequest.findFirst({
      where: {
        trainerId: account.trainerId,
        status: { in: ["requested", "approved", "processing"] }
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        id: account.id,
        trainerId: account.trainerId,
        trainerName: account.trainer?.fullName || "-",
        email: account.trainer?.email || "",
        accountHolderName: account.accountHolderName,
        bankName: account.bankName,
        accountNumber: decrypted, // fully decrypted for admin
        maskedAccountNumber: masked,
        accountNumberLast4: account.accountNumberLast4,
        ifsc: account.ifsc,
        upiId: account.upiId,
        pan: account.pan,
        phoneNumber: account.phoneNumber,
        status: account.status,
        rejectionReason: account.rejectionReason,
        isLocked: account.isLocked,
        activePayoutRequest,
        history
      }
    });
  } catch (error) {
    console.error("getAdminTrainerPayoutAccountById error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// 7. PATCH /api/admin/trainer-payout-accounts/:accountId/verify
const verifyAdminTrainerPayoutAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { note } = req.body;

    const account = await prisma.trainerPayoutAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      return res.status(404).json({ success: false, message: "Payout account not found." });
    }

    const adminId = parseInt(req.user.id, 10);
    const adminUser = await prisma.user.findUnique({ where: { id: adminId } });
    const adminName = adminUser ? adminUser.fullName : "Admin";

    const updated = await prisma.trainerPayoutAccount.update({
      where: { id: accountId },
      data: {
        status: "verified",
        verifiedByAdminId: adminId,
        verifiedAt: new Date(),
        rejectionReason: null
      }
    });

    await prisma.trainerPayoutAccountHistory.create({
      data: {
        payoutAccountId: accountId,
        trainerId: account.trainerId,
        oldStatus: account.status,
        newStatus: "verified",
        adminId,
        adminName,
        note: note || "Payout account verified by admin."
      }
    });

    return res.status(200).json({ success: true, message: "Account verified successfully.", data: updated });
  } catch (error) {
    console.error("verifyAdminTrainerPayoutAccount error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// 8. PATCH /api/admin/trainer-payout-accounts/:accountId/reject
const rejectAdminTrainerPayoutAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ success: false, message: "Reason is required." });
    }

    const account = await prisma.trainerPayoutAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      return res.status(404).json({ success: false, message: "Payout account not found." });
    }

    const adminId = parseInt(req.user.id, 10);
    const adminUser = await prisma.user.findUnique({ where: { id: adminId } });
    const adminName = adminUser ? adminUser.fullName : "Admin";

    const updated = await prisma.trainerPayoutAccount.update({
      where: { id: accountId },
      data: {
        status: "rejected",
        rejectedByAdminId: adminId,
        rejectedAt: new Date(),
        rejectionReason: reason
      }
    });

    await prisma.trainerPayoutAccountHistory.create({
      data: {
        payoutAccountId: accountId,
        trainerId: account.trainerId,
        oldStatus: account.status,
        newStatus: "rejected",
        adminId,
        adminName,
        note: reason
      }
    });

    return res.status(200).json({ success: true, message: "Account rejected successfully.", data: updated });
  } catch (error) {
    console.error("rejectAdminTrainerPayoutAccount error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// 9. GET /api/admin/trainer-payout-accounts/:accountId/history
const getAdminTrainerPayoutAccountHistory = async (req, res) => {
  try {
    const { accountId } = req.params;
    const history = await prisma.trainerPayoutAccountHistory.findMany({
      where: { payoutAccountId: accountId },
      orderBy: { createdAt: "desc" }
    });

    return res.status(200).json({ success: true, data: history });
  } catch (error) {
    console.error("getAdminTrainerPayoutAccountHistory error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// 10. GET /api/admin/trainer-payout-requests
const getAdminTrainerPayoutRequests = async (req, res) => {
  try {
    const { status, accountStatus, search, from, to } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const where = {};
    if (status) where.status = status;

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    if (search) {
      where.OR = [
        { trainerName: { contains: search, mode: "insensitive" } },
        { utrReference: { contains: search, mode: "insensitive" } }
      ];
    }

    const total = await prisma.trainerPayoutRequest.count({ where });
    const totalPages = Math.ceil(total / limit);

    const requests = await prisma.trainerPayoutRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit
    });

    // Populate payoutAccountStatus
    const trainerIds = requests.map(r => r.trainerId);
    const accounts = await prisma.trainerPayoutAccount.findMany({
      where: { trainerId: { in: trainerIds } }
    });
    const accountMap = new Map(accounts.map(a => [a.trainerId, a.status]));

    let formatted = requests.map(r => ({
      ...r,
      requestedDate: r.createdAt,
      payoutAccountStatus: accountMap.get(r.trainerId) || "missing"
    }));

    if (accountStatus) {
      formatted = formatted.filter(r => r.payoutAccountStatus === accountStatus);
    }

    return res.status(200).json({
      success: true,
      data: formatted,
      pagination: {
        page,
        limit,
        total: formatted.length,
        totalPages: Math.ceil(formatted.length / limit)
      }
    });
  } catch (error) {
    console.error("getAdminTrainerPayoutRequests error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// 11. GET /api/admin/trainer-payout-requests/:requestId
const getAdminTrainerPayoutRequestById = async (req, res) => {
  try {
    const { requestId } = req.params;
    const request = await prisma.trainerPayoutRequest.findUnique({
      where: { id: requestId },
      include: { history: { orderBy: { createdAt: "desc" } } }
    });

    if (!request) {
      return res.status(404).json({ success: false, message: "Payout request not found." });
    }

    const account = await prisma.trainerPayoutAccount.findUnique({
      where: { trainerId: request.trainerId }
    });
    const payoutAccountStatus = account ? account.status : "missing";

    // Balance snapshots
    const earnings = await prisma.trainerEarning.findMany({
      where: { trainerId: request.trainerId }
    });

    const activePayoutRequests = await prisma.trainerPayoutRequest.findMany({
      where: {
        trainerId: request.trainerId,
        status: { in: ["requested", "approved", "processing"] }
      }
    });

    const paidPayoutRequests = await prisma.trainerPayoutRequest.findMany({
      where: {
        trainerId: request.trainerId,
        status: "paid"
      }
    });

    const lockedAmountPaise = activePayoutRequests.reduce((sum, r) => sum + r.requestedAmountPaise, 0);
    const totalPaidPaise = paidPayoutRequests.reduce((sum, r) => sum + r.requestedAmountPaise, 0);

    const excludedStatuses = ["rejected", "adjusted", "pending_session_completion", "failed", "cancelled", "on_hold"];
    const totalEarnedPaise = earnings
      .filter(e => !excludedStatuses.includes(e.status))
      .reduce((sum, e) => sum + e.finalPayablePaise, 0);

    const availableBalancePaise = Math.max(totalEarnedPaise - totalPaidPaise - lockedAmountPaise, 0);

    const paidAmountPaise = totalPaidPaise;

    return res.status(200).json({
      success: true,
      data: {
        ...request,
        payoutAccountSnapshot: request.payoutAccountSnapshot,
        payoutAccountStatus,
        payoutRequestHistory: request.history,
        trainerBalanceSnapshot: {
          availableBalancePaise,
          lockedAmountPaise,
          paidAmountPaise
        }
      }
    });
  } catch (error) {
    console.error("getAdminTrainerPayoutRequestById error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// 12. PATCH /api/admin/trainer-payout-requests/:requestId/approve
const approveAdminTrainerPayoutRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const request = await prisma.trainerPayoutRequest.findUnique({ where: { id: requestId } });

    if (!request || request.status !== "requested") {
      return res.status(400).json({ success: false, message: "Only requested payout requests can be approved." });
    }

    const account = await prisma.trainerPayoutAccount.findUnique({
      where: { trainerId: request.trainerId }
    });

    if (!account || account.status !== "verified") {
      return res.status(400).json({
        success: false,
        message: "Payout account is not verified. Please upload and verify payout account details before requesting payout."
      });
    }

    if (request.requestedAmountPaise < 50000) {
      return res.status(400).json({
        success: false,
        message: "Requested amount must be at least 50000 paise."
      });
    }

    // === ENFORCE 85% TRAINER ATTENDANCE RULE ===
    const requestEarnings = await prisma.trainerEarning.findMany({
      where: { payoutRequestId: requestId },
      select: { sessionId: true }
    });
    const sessionIds = [...new Set(requestEarnings.map(e => e.sessionId).filter(Boolean))];

    if (sessionIds.length > 0) {
      const occurrences = await prisma.sessionOccurrence.findMany({
        where: { sessionId: { in: sessionIds }, status: "completed" },
        select: { id: true, sessionId: true, occurrenceDate: true, startsAt: true, endsAt: true }
      });

      for (const occ of occurrences) {
        const sessionDurationMins = (occ.startsAt && occ.endsAt)
          ? Math.max(1, Math.round((new Date(occ.endsAt) - new Date(occ.startsAt)) / 60000))
          : 60;
        const requiredSeconds = Math.ceil(sessionDurationMins * 60 * 0.85);

        const trainerAtt = await prisma.attendance.findFirst({
          where: {
            sessionId: occ.sessionId,
            occurrenceDate: occ.occurrenceDate,
            studentId: request.trainerId
          }
        });

        const totalSecs = trainerAtt?.totalDurationSeconds || 0;

        if (totalSecs < requiredSeconds) {
          return res.status(400).json({
            success: false,
            message: `Payout cannot be approved. Trainer failed to meet the 85% attendance requirement for a session on ${occ.occurrenceDate.toISOString().split('T')[0]}. Required: ${requiredSeconds}s, Attended: ${totalSecs}s.`
          });
        }
      }
    }

    const adminId = parseInt(req.user.id, 10);
    const adminUser = await prisma.user.findUnique({ where: { id: adminId } });
    const adminName = adminUser ? adminUser.fullName : "Admin";

    const updated = await prisma.$transaction(async (tx) => {
      const pr = await tx.trainerPayoutRequest.update({
        where: { id: requestId },
        data: {
          status: "approved",
          approvedByAdminId: adminId,
          approvedAt: new Date()
        }
      });

      await tx.trainerEarning.updateMany({
        where: { payoutRequestId: requestId },
        data: { status: "approved" }
      });

      await tx.trainerPayoutRequestHistory.create({
        data: {
          payoutRequestId: requestId,
          trainerId: request.trainerId,
          action: "approved",
          oldStatus: "requested",
          newStatus: "approved",
          adminId,
          adminName,
          note: "Payout request approved."
        }
      });

      return pr;
    });

    return res.status(200).json({ success: true, message: "Request approved successfully.", data: updated });
  } catch (error) {
    console.error("approveAdminTrainerPayoutRequest error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// 13. PATCH /api/admin/trainer-payout-requests/:requestId/reject
const rejectAdminTrainerPayoutRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { note } = req.body;

    if (!note) {
      return res.status(400).json({ success: false, message: "Rejection note is required." });
    }

    const request = await prisma.trainerPayoutRequest.findUnique({ where: { id: requestId } });

    if (!request || !["requested", "approved"].includes(request.status)) {
      return res.status(400).json({ success: false, message: "Can only reject requested or approved requests." });
    }

    const adminId = parseInt(req.user.id, 10);
    const adminUser = await prisma.user.findUnique({ where: { id: adminId } });
    const adminName = adminUser ? adminUser.fullName : "Admin";

    const updated = await prisma.$transaction(async (tx) => {
      const pr = await tx.trainerPayoutRequest.update({
        where: { id: requestId },
        data: {
          status: "rejected",
          rejectionReason: note,
          adminNote: note,
          rejectedByAdminId: adminId,
          rejectedAt: new Date()
        }
      });

      await tx.trainerEarning.updateMany({
        where: { payoutRequestId: requestId },
        data: {
          status: "unpaid",
          payoutRequestId: null
        }
      });

      await tx.trainerPayoutRequestHistory.create({
        data: {
          payoutRequestId: requestId,
          trainerId: request.trainerId,
          action: "rejected",
          oldStatus: request.status,
          newStatus: "rejected",
          adminId,
          adminName,
          note
        }
      });

      return pr;
    });

    return res.status(200).json({ success: true, message: "Request rejected successfully.", data: updated });
  } catch (error) {
    console.error("rejectAdminTrainerPayoutRequest error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// 14. PATCH /api/admin/trainer-payout-requests/:requestId/processing
const processingAdminTrainerPayoutRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { note } = req.body;

    const request = await prisma.trainerPayoutRequest.findUnique({ where: { id: requestId } });

    if (!request || request.status !== "approved") {
      return res.status(400).json({ success: false, message: "Only approved payout requests can be moved to processing." });
    }

    const adminId = parseInt(req.user.id, 10);
    const adminUser = await prisma.user.findUnique({ where: { id: adminId } });
    const adminName = adminUser ? adminUser.fullName : "Admin";

    const updated = await prisma.$transaction(async (tx) => {
      const pr = await tx.trainerPayoutRequest.update({
        where: { id: requestId },
        data: {
          status: "processing",
          processingByAdminId: adminId,
          processingAt: new Date()
        }
      });

      await tx.trainerEarning.updateMany({
        where: { payoutRequestId: requestId },
        data: { status: "processing" }
      });

      await tx.trainerPayoutRequestHistory.create({
        data: {
          payoutRequestId: requestId,
          trainerId: request.trainerId,
          action: "processing",
          oldStatus: "approved",
          newStatus: "processing",
          adminId,
          adminName,
          note: note || "Payout request marked as processing."
        }
      });

      return pr;
    });

    return res.status(200).json({ success: true, message: "Request status updated to processing.", data: updated });
  } catch (error) {
    console.error("processingAdminTrainerPayoutRequest error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// 15. PATCH /api/admin/trainer-payout-requests/:requestId/paid
const paidAdminTrainerPayoutRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { utrReference, manualPaidDate, note } = req.body;

    if (!utrReference || !manualPaidDate) {
      return res.status(400).json({ success: false, message: "utrReference and manualPaidDate are required." });
    }

    const request = await prisma.trainerPayoutRequest.findUnique({ where: { id: requestId } });

    if (!request || !["approved", "processing"].includes(request.status)) {
      return res.status(400).json({ success: false, message: "Only approved or processing payout requests can be marked as paid." });
    }

    const adminId = parseInt(req.user.id, 10);
    const adminUser = await prisma.user.findUnique({ where: { id: adminId } });
    const adminName = adminUser ? adminUser.fullName : "Admin";

    const updated = await prisma.$transaction(async (tx) => {
      const pr = await tx.trainerPayoutRequest.update({
        where: { id: requestId },
        data: {
          status: "paid",
          utrReference,
          manualPaidDate: new Date(manualPaidDate),
          paidByAdminId: adminId,
          paidAt: new Date(),
          adminNote: note || null
        }
      });

      await tx.trainerEarning.updateMany({
        where: { payoutRequestId: requestId },
        data: {
          status: "paid",
          paidAt: new Date()
        }
      });

      await tx.trainerPayoutRequestHistory.create({
        data: {
          payoutRequestId: requestId,
          trainerId: request.trainerId,
          action: "paid",
          oldStatus: request.status,
          newStatus: "paid",
          adminId,
          adminName,
          note: note || "Payout completed manually."
        }
      });

      return pr;
    });

    return res.status(200).json({ success: true, message: "Request completed successfully.", data: updated });
  } catch (error) {
    console.error("paidAdminTrainerPayoutRequest error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// 16. GET /api/admin/trainer-payout-requests/:requestId/history
const getAdminTrainerPayoutRequestHistory = async (req, res) => {
  try {
    const { requestId } = req.params;
    const history = await prisma.trainerPayoutRequestHistory.findMany({
      where: { payoutRequestId: requestId },
      orderBy: { createdAt: "desc" }
    });

    return res.status(200).json({ success: true, data: history });
  } catch (error) {
    console.error("getAdminTrainerPayoutRequestHistory error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

module.exports = {
  getAdminTrainerEarnings,
  getAdminTrainerEarningById,
  getAdminSessionsPricingRef,
  updateAdminSessionPricing,
  getAdminTrainerPayoutAccounts,
  getAdminTrainerPayoutAccountById,
  verifyAdminTrainerPayoutAccount,
  rejectAdminTrainerPayoutAccount,
  getAdminTrainerPayoutAccountHistory,
  getAdminTrainerPayoutRequests,
  getAdminTrainerPayoutRequestById,
  approveAdminTrainerPayoutRequest,
  rejectAdminTrainerPayoutRequest,
  processingAdminTrainerPayoutRequest,
  paidAdminTrainerPayoutRequest,
  getAdminTrainerPayoutRequestHistory
};
