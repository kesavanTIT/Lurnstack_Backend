const prisma = require("../config/db");
const { encrypt, decrypt, maskAccountNumber } = require("../utils/encryption");

// Format date to YYYY-MM-DD
const formatDate = (date) => {
  return date.toISOString().split("T")[0];
};

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

// Helper to get current cycle info for payment-summary
const getCurrentCycleInfo = (now = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "numeric",
    year: "numeric"
  });
  const parts = formatter.formatToParts(now);
  const partMap = {};
  parts.forEach(p => { partMap[p.type] = p.value; });
  
  const day = parseInt(partMap.day, 10);
  const month = parseInt(partMap.month, 10);
  const year = parseInt(partMap.year, 10);
  
  let cycleStart, cycleEnd, nextPayoutDate;
  if (day <= 15) {
    cycleStart = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+05:30`);
    cycleEnd = new Date(`${year}-${String(month).padStart(2, '0')}-15T23:59:59+05:30`);
    nextPayoutDate = new Date(`${year}-${String(month).padStart(2, '0')}-16T00:00:00+05:30`);
  } else {
    cycleStart = new Date(`${year}-${String(month).padStart(2, '0')}-16T00:00:00+05:30`);
    const lastDay = new Date(year, month, 0).getDate();
    cycleEnd = new Date(`${year}-${String(month).padStart(2, '0')}-${lastDay}T23:59:59+05:30`);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    nextPayoutDate = new Date(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00+05:30`);
  }
  
  return { cycleStart, cycleEnd, nextPayoutDate };
};

// Validate that logged-in user is a trainer
const validateTrainer = (req, res) => {
  if (!req.user || !req.user.role || String(req.user.role).toUpperCase() !== "TRAINER") {
    res.status(403).json({ success: false, message: "Access denied. Logged-in user is not a trainer." });
    return null;
  }
  const trainerId = Number.parseInt(req.user.id, 10);
  if (!Number.isInteger(trainerId) || trainerId <= 0) {
    res.status(401).json({ success: false, message: "Invalid authentication payload." });
    return null;
  }
  return trainerId;
};

// Helper to calculate trainer payout balance
const getTrainerPayoutBalanceHelper = async (trainerId) => {
  const earnings = await prisma.trainerEarning.findMany({
    where: { trainerId }
  });

  const unpaidEarnings = earnings.filter(e => e.status === "unpaid" || e.status === "payable");

  const activePayoutRequests = await prisma.trainerPayoutRequest.findMany({
    where: {
      trainerId,
      status: { in: ["requested", "approved", "processing"] }
    }
  });

  const paidPayoutRequests = await prisma.trainerPayoutRequest.findMany({
    where: {
      trainerId,
      status: "paid"
    }
  });

  const lockedAmountPaise = activePayoutRequests.reduce((sum, r) => sum + r.requestedAmountPaise, 0);
  const totalPaidPaise = paidPayoutRequests.reduce((sum, r) => sum + r.requestedAmountPaise, 0);
  const hasActiveRequest = activePayoutRequests.length > 0;

  const excludedStatuses = ["rejected", "adjusted", "pending_session_completion", "failed", "cancelled", "on_hold"];
  const totalEarnedPaise = earnings
    .filter(e => !excludedStatuses.includes(e.status))
    .reduce((sum, e) => sum + e.finalPayablePaise, 0);

  const availableBalancePaise = Math.max(totalEarnedPaise - totalPaidPaise - lockedAmountPaise, 0);

  const account = await prisma.trainerPayoutAccount.findUnique({
    where: { trainerId }
  });
  const payoutAccountStatus = account ? account.status : "missing";

  let blockReason = null;
  if (payoutAccountStatus !== "verified") {
    if (payoutAccountStatus === "missing") {
      blockReason = "NO_PAYOUT_ACCOUNT";
    } else if (payoutAccountStatus === "pending") {
      blockReason = "ACCOUNT_PENDING_VERIFICATION";
    } else if (payoutAccountStatus === "rejected") {
      blockReason = "ACCOUNT_REJECTED";
    }
  } else if (hasActiveRequest) {
    blockReason = "ACTIVE_REQUEST_EXISTS";
  } else if (availableBalancePaise < 50000) {
    blockReason = "INSUFFICIENT_BALANCE";
  }

  const canRequest = !blockReason;

  const now = new Date();
  const { cycleStart, cycleEnd } = getCurrentCycleInfo(now);

  return {
    totalEarnedPaise,
    totalPaidPaise,
    totalUnpaidEarningsPaise: totalEarnedPaise,
    cycleClearedEarningsPaise: totalEarnedPaise,
    pendingCycleEarningsPaise: 0,
    lockedAmountPaise,
    availableBalancePaise,
    minimumPayoutPaise: 50000,
    cycleStartDate: formatDate(cycleStart),
    cycleEndDate: formatDate(cycleEnd),
    isCycleOpen: true,
    hasActiveRequest,
    canRequest,
    blockReason,
    testMode: false,
    unpaidEarnings,
    account
  };
};

// 1. GET /api/trainer/payment-summary
const getPaymentSummary = async (req, res) => {
  try {
    const trainerId = validateTrainer(req, res);
    if (!trainerId) return;

    const balanceData = await getTrainerPayoutBalanceHelper(trainerId);

    const { nextPayoutDate } = getCurrentCycleInfo(new Date());

    return res.status(200).json({
      success: true,
      data: {
        totalEarningsPaise: balanceData.totalEarnedPaise,
        totalEarnedPaise: balanceData.totalEarnedPaise,
        totalPaidPaise: balanceData.totalPaidPaise,
        pendingEarningsPaise: balanceData.pendingCycleEarningsPaise,
        availableBalancePaise: balanceData.availableBalancePaise,
        lockedAmountPaise: balanceData.lockedAmountPaise,
        requestedAmountPaise: balanceData.lockedAmountPaise,
        paidAmountPaise: balanceData.totalPaidPaise,
        minimumPayoutPaise: balanceData.minimumPayoutPaise,
        payoutCycleDays: 15,
        cycleStart: balanceData.cycleStartDate,
        cycleEnd: balanceData.cycleEndDate,
        nextPayoutDate: formatDate(nextPayoutDate),
        isPayoutWindowOpen: balanceData.canRequest,
        hasActiveRequest: balanceData.hasActiveRequest,
        activeRequestStatus: balanceData.hasActiveRequest ? (await prisma.trainerPayoutRequest.findFirst({
          where: { trainerId, status: { in: ["requested", "approved", "processing"] } }
        }))?.status || null : null,
        payoutBlockReason: balanceData.blockReason,
        payoutAccountStatus: balanceData.account ? balanceData.account.status : "missing",
        testMode: balanceData.testMode
      }
    });
  } catch (error) {
    console.error("getPaymentSummary error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// 1b. GET /api/trainer/payout-balance
const getPayoutBalance = async (req, res) => {
  try {
    const trainerId = validateTrainer(req, res);
    if (!trainerId) return;

    const balanceData = await getTrainerPayoutBalanceHelper(trainerId);

    return res.status(200).json({
      success: true,
      data: {
        totalEarnedPaise: balanceData.totalEarnedPaise,
        totalPaidPaise: balanceData.totalPaidPaise,
        totalUnpaidEarningsPaise: balanceData.totalUnpaidEarningsPaise,
        cycleClearedEarningsPaise: balanceData.cycleClearedEarningsPaise,
        pendingCycleEarningsPaise: balanceData.pendingCycleEarningsPaise,
        lockedAmountPaise: balanceData.lockedAmountPaise,
        availableBalancePaise: balanceData.availableBalancePaise,
        minimumPayoutPaise: balanceData.minimumPayoutPaise,
        cycleStartDate: balanceData.cycleStartDate,
        cycleEndDate: balanceData.cycleEndDate,
        isCycleOpen: balanceData.isCycleOpen,
        hasActiveRequest: balanceData.hasActiveRequest,
        canRequest: balanceData.canRequest,
        blockReason: balanceData.blockReason,
        testMode: balanceData.testMode
      }
    });
  } catch (error) {
    console.error("getPayoutBalance error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};


// 2. GET /api/trainer/session-earnings
// 2. GET /api/trainer/session-earnings
const getSessionEarnings = async (req, res) => {
  try {
    const trainerId = validateTrainer(req, res);
    if (!trainerId) return;

    const { search } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 100;
    const skip = (page - 1) * limit;

    // 1. Fetch all earnings for the trainer (so we can group them comprehensively without status exclusion)
    const earnings = await prisma.trainerEarning.findMany({
      where: { trainerId },
      include: {
        session: {
          select: { id: true }
        },
        booking: {
          include: {
            student: {
              select: { fullName: true }
            }
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });

    // 2. Fetch all payout requests for the trainer
    const payoutRequests = await prisma.trainerPayoutRequest.findMany({
      where: { trainerId }
    });

    const payoutRequestMap = new Map(payoutRequests.map(pr => [pr.id, pr]));
    const requestRemainingAmountMap = new Map(
      payoutRequests.map(pr => [pr.id, pr.requestedAmountPaise])
    );

    const sessionsMap = new Map();
    const flatEarnings = [];
    const excludedStatuses = ["rejected", "adjusted", "pending_session_completion", "failed", "cancelled", "on_hold"];

    for (const e of earnings) {
      // Filter by search on the earning if requested
      if (search && e.sessionTitle && !e.sessionTitle.toLowerCase().includes(search.toLowerCase())) continue;

      // 1. Resolve stable sessionId
      let sessionId = e.sessionId;
      if (!sessionId && e.session && e.session.id) {
        sessionId = e.session.id;
      }
      if (!sessionId && e.booking && e.booking.sessionId) {
        sessionId = e.booking.sessionId;
      }
      if (!sessionId && e.booking && e.booking.liveSessionId) {
        sessionId = e.booking.liveSessionId;
      }
      if (!sessionId) {
        const normalizedTitle = String(e.sessionTitle || "Unknown Session")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "-");
        sessionId = `fallback-${trainerId}-${normalizedTitle}`;
      }

      // 2. Resolve payout status and portions
      let payoutStatus = e.status;
      let payoutRequestId = e.payoutRequestId;
      let paidPortion = 0;
      let lockedPortion = 0;
      let availablePortion = e.finalPayablePaise;

      if (excludedStatuses.includes(e.status)) {
        availablePortion = 0;
      }

      if (e.payoutRequestId && payoutRequestMap.has(e.payoutRequestId)) {
        const pr = payoutRequestMap.get(e.payoutRequestId);
        payoutStatus = pr.status;
        const rem = requestRemainingAmountMap.get(pr.id) || 0;
        if (pr.status === "paid") {
          paidPortion = Math.min(e.finalPayablePaise, rem);
          requestRemainingAmountMap.set(pr.id, Math.max(rem - paidPortion, 0));
          availablePortion = excludedStatuses.includes(e.status) ? 0 : Math.max(e.finalPayablePaise - paidPortion, 0);
        } else if (["requested", "approved", "processing"].includes(pr.status)) {
          lockedPortion = Math.min(e.finalPayablePaise, rem);
          requestRemainingAmountMap.set(pr.id, Math.max(rem - lockedPortion, 0));
          availablePortion = excludedStatuses.includes(e.status) ? 0 : Math.max(e.finalPayablePaise - lockedPortion, 0);
        }
      }

      // Determine statusSummary key
      let summaryStatus = null;
      if (payoutStatus === "paid") {
        summaryStatus = "paid";
      } else if (["requested", "approved"].includes(payoutStatus)) {
        summaryStatus = "requested";
      } else if (payoutStatus === "processing") {
        summaryStatus = "processing";
      } else if (["unpaid", "payable"].includes(payoutStatus)) {
        summaryStatus = "unpaid";
      }

      const paidDateStr = e.paidAt ? formatDate(e.paidAt) : formatDate(e.createdAt);

      // 3. Format earning row for nested list
      const earningRow = {
        earningId: e.id,
        paymentId: e.paymentId || (e.booking && e.booking.payments?.[0]?.id) || null,
        studentName: e.booking?.student?.fullName || "Student",
        paidDate: paidDateStr,
        sessionPricePaise: e.sessionPricePaise,
        trainerSharePercentage: e.trainerSharePercentage,
        trainerEarningPaise: e.trainerEarningPaise,
        finalPayablePaise: e.finalPayablePaise,
        payoutStatus,
        payoutRequestId
      };

      // 4. Update group
      if (!sessionsMap.has(sessionId)) {
        sessionsMap.set(sessionId, {
          sessionId,
          sessionTitle: e.sessionTitle || "Live Session",
          adminSetPricePaise: e.sessionPricePaise,
          trainerSharePercentage: e.trainerSharePercentage,
          paidStudentCount: 0,
          grossRevenuePaise: 0,
          trainerEarningPaise: 0,
          paidAmountPaise: 0,
          availableBalancePaise: 0,
          statusSummary: {
            paid: 0,
            unpaid: 0,
            requested: 0,
            processing: 0
          },
          latestEarningDate: e.createdAt,
          earnings: []
        });
      }

      const group = sessionsMap.get(sessionId);
      group.earnings.push(earningRow);

      if (!excludedStatuses.includes(e.status)) {
        group.paidStudentCount += 1;
      }
      group.grossRevenuePaise += e.grossRevenuePaise;
      group.trainerEarningPaise += e.finalPayablePaise;
      group.paidAmountPaise += paidPortion;
      group.availableBalancePaise += availablePortion;

      if (summaryStatus && group.statusSummary[summaryStatus] !== undefined) {
        group.statusSummary[summaryStatus] += 1;
      }

      if (e.createdAt > group.latestEarningDate) {
        group.latestEarningDate = e.createdAt;
      }

      // Legacy flat earnings array item for backward compatibility
      flatEarnings.push({
        earningId: e.id,
        sessionId,
        sessionTitle: e.sessionTitle,
        sessionPricePaise: e.sessionPricePaise,
        trainerSharePercentage: e.trainerSharePercentage,
        trainerEarningPaise: e.trainerEarningPaise,
        finalPayablePaise: e.finalPayablePaise,
        payoutStatus,
        payoutRequestId,
        paidDate: paidDateStr
      });
    }

    const sessions = Array.from(sessionsMap.values()).map(s => ({
      ...s,
      latestEarningDate: formatDate(s.latestEarningDate)
    }));

    // Sort sessions by latestEarningDate desc so newest sessions are shown first
    sessions.sort((a, b) => new Date(b.latestEarningDate) - new Date(a.latestEarningDate));

    // Required Debug Logs
    console.log("trainerId", trainerId);
    console.log("trainer earnings count", earnings.length);
    console.log("grouped sessions count", sessions.length);

    const total = sessions.length;
    const totalPages = Math.ceil(total / limit);
    const paginatedSessions = sessions.slice(skip, skip + limit);

    return res.status(200).json({
      success: true,
      sessions: paginatedSessions, // root level sessions array
      earnings: flatEarnings, // legacy flat earnings array
      data: {
        sessions: paginatedSessions, // data level sessions array
        earnings: flatEarnings // data level flat earnings array
      },
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error("getSessionEarnings error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// 3. GET /api/trainer/payout-account
const getPayoutAccount = async (req, res) => {
  try {
    const trainerId = validateTrainer(req, res);
    if (!trainerId) return;

    const account = await prisma.trainerPayoutAccount.findUnique({
      where: { trainerId }
    });

    if (!account) {
      return res.status(200).json({
        success: true,
        data: {
          status: "missing"
        }
      });
    }

    const decrypted = decrypt(account.accountNumber);
    const masked = maskAccountNumber(decrypted);

    return res.status(200).json({
      success: true,
      data: {
        id: account.id,
        accountHolderName: account.accountHolderName,
        bankName: account.bankName,
        maskedAccountNumber: masked,
        accountNumberLast4: account.accountNumberLast4,
        ifsc: account.ifsc,
        upiId: account.upiId,
        pan: account.pan,
        phoneNumber: account.phoneNumber,
        accountType: "Savings",
        status: account.status,
        rejectionReason: account.rejectionReason,
        isLocked: account.isLocked,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt
      }
    });
  } catch (error) {
    console.error("getPayoutAccount error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// Validate payout account forms
const validatePayoutAccountForm = async (req, res, trainerId) => {
  const accountHolderName = req.body.accountHolderName;
  const bankName = req.body.bankName;
  const accountNumber = req.body.accountNumber;
  const confirmAccountNumber = req.body.confirmAccountNumber;
  const ifsc = req.body.ifsc || req.body.ifscCode;
  const pan = req.body.pan || req.body.panNumber || null;
  const phoneNumber = req.body.phoneNumber;
  const upiId = req.body.upiId || null;
  const accountType = req.body.accountType || "Savings";

  if (!accountHolderName) {
    res.status(400).json({ success: false, message: "Account holder name is required." });
    return null;
  }
  if (!bankName) {
    res.status(400).json({ success: false, message: "Bank name is required." });
    return null;
  }
  if (!accountNumber) {
    res.status(400).json({ success: false, message: "Account number is required." });
    return null;
  }
  if (!confirmAccountNumber) {
    res.status(400).json({ success: false, message: "Confirm account number is required." });
    return null;
  }
  if (accountNumber !== confirmAccountNumber) {
    res.status(400).json({ success: false, message: "Account numbers do not match." });
    return null;
  }
  if (!ifsc) {
    res.status(400).json({ success: false, message: "IFSC code is required." });
    return null;
  }
  if (!phoneNumber) {
    res.status(400).json({ success: false, message: "Phone number is required." });
    return null;
  }

  // Active payout request checks
  const activeRequest = await prisma.trainerPayoutRequest.findFirst({
    where: {
      trainerId,
      status: { in: ["requested", "approved", "processing"] }
    }
  });

  if (activeRequest) {
    res.status(400).json({
      success: false,
      message: "Cannot create or update payout account while there is an active payout request."
    });
    return null;
  }

  return {
    accountHolderName,
    bankName,
    accountNumber,
    ifsc,
    pan,
    phoneNumber,
    upiId,
    accountType
  };
};

// 4. POST /api/trainer/payout-account
const createPayoutAccount = async (req, res) => {
  try {
    const trainerId = validateTrainer(req, res);
    if (!trainerId) return;

    const validated = await validatePayoutAccountForm(req, res, trainerId);
    if (!validated) return;

    const existingAccount = await prisma.trainerPayoutAccount.findUnique({
      where: { trainerId }
    });

    if (existingAccount) {
      return res.status(400).json({
        success: false,
        message: "Payout account already exists. Use PATCH to update it."
      });
    }

    const encrypted = encrypt(validated.accountNumber);
    const accountNumberLast4 = validated.accountNumber.slice(-4);

    const account = await prisma.trainerPayoutAccount.create({
      data: {
        trainerId,
        accountHolderName: validated.accountHolderName,
        bankName: validated.bankName,
        accountNumber: encrypted,
        accountNumberLast4,
        ifsc: validated.ifsc,
        upiId: validated.upiId,
        pan: validated.pan || "",
        phoneNumber: validated.phoneNumber,
        status: "pending",
        isLocked: false
      }
    });

    await prisma.trainerPayoutAccountHistory.create({
      data: {
        payoutAccountId: account.id,
        trainerId,
        oldStatus: "none",
        newStatus: "pending",
        adminId: null,
        adminName: null,
        note: "Payout account details submitted by trainer."
      }
    });

    const masked = maskAccountNumber(validated.accountNumber);

    return res.status(201).json({
      success: true,
      data: {
        id: account.id,
        accountHolderName: account.accountHolderName,
        bankName: account.bankName,
        maskedAccountNumber: masked,
        accountNumberLast4: account.accountNumberLast4,
        ifsc: account.ifsc,
        upiId: account.upiId,
        pan: account.pan,
        phoneNumber: account.phoneNumber,
        accountType: validated.accountType,
        status: account.status,
        rejectionReason: account.rejectionReason,
        isLocked: account.isLocked,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt
      }
    });
  } catch (error) {
    console.error("createPayoutAccount error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// 5. PATCH /api/trainer/payout-account
const updatePayoutAccount = async (req, res) => {
  try {
    const trainerId = validateTrainer(req, res);
    if (!trainerId) return;

    const existingAccount = await prisma.trainerPayoutAccount.findUnique({
      where: { trainerId }
    });

    if (!existingAccount) {
      return res.status(404).json({
        success: false,
        message: "Payout account not found."
      });
    }

    // Merge incoming body with existing account details to handle partial PATCH updates
    const decryptedAccountNumber = decrypt(existingAccount.accountNumber);
    const mergedReq = {
      body: {
        accountHolderName: req.body.accountHolderName !== undefined ? req.body.accountHolderName : existingAccount.accountHolderName,
        bankName: req.body.bankName !== undefined ? req.body.bankName : existingAccount.bankName,
        accountNumber: req.body.accountNumber !== undefined ? req.body.accountNumber : decryptedAccountNumber,
        confirmAccountNumber: req.body.confirmAccountNumber !== undefined ? req.body.confirmAccountNumber : (req.body.accountNumber !== undefined ? req.body.confirmAccountNumber : decryptedAccountNumber),
        ifsc: req.body.ifsc !== undefined ? req.body.ifsc : (req.body.ifscCode !== undefined ? req.body.ifscCode : existingAccount.ifsc),
        pan: req.body.pan !== undefined ? req.body.pan : (req.body.panNumber !== undefined ? req.body.panNumber : existingAccount.pan),
        phoneNumber: req.body.phoneNumber !== undefined ? req.body.phoneNumber : existingAccount.phoneNumber,
        upiId: req.body.upiId !== undefined ? req.body.upiId : existingAccount.upiId,
        accountType: req.body.accountType !== undefined ? req.body.accountType : "Savings"
      }
    };

    const validated = await validatePayoutAccountForm(mergedReq, res, trainerId);
    if (!validated) return;

    const encrypted = encrypt(validated.accountNumber);
    const accountNumberLast4 = validated.accountNumber.slice(-4);
    const oldStatus = existingAccount.status;

    const updated = await prisma.trainerPayoutAccount.update({
      where: { trainerId },
      data: {
        accountHolderName: validated.accountHolderName,
        bankName: validated.bankName,
        accountNumber: encrypted,
        accountNumberLast4,
        ifsc: validated.ifsc,
        upiId: validated.upiId,
        pan: validated.pan || "",
        phoneNumber: validated.phoneNumber,
        status: "pending",
        rejectionReason: null
      }
    });

    await prisma.trainerPayoutAccountHistory.create({
      data: {
        payoutAccountId: updated.id,
        trainerId,
        oldStatus,
        newStatus: "pending",
        adminId: null,
        adminName: null,
        note: "Payout account details updated by trainer."
      }
    });

    const masked = maskAccountNumber(validated.accountNumber);

    return res.status(200).json({
      success: true,
      data: {
        id: updated.id,
        accountHolderName: updated.accountHolderName,
        bankName: updated.bankName,
        maskedAccountNumber: masked,
        accountNumberLast4: updated.accountNumberLast4,
        ifsc: updated.ifsc,
        upiId: updated.upiId,
        pan: updated.pan,
        phoneNumber: updated.phoneNumber,
        accountType: validated.accountType,
        status: updated.status,
        rejectionReason: updated.rejectionReason,
        isLocked: updated.isLocked,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt
      }
    });
  } catch (error) {
    console.error("updatePayoutAccount error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// 6. GET /api/trainer/payout-requests
const getPayoutRequests = async (req, res) => {
  try {
    const trainerId = validateTrainer(req, res);
    if (!trainerId) return;

    const { status } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 100;
    const skip = (page - 1) * limit;

    const where = { trainerId };
    if (status) where.status = status;

    const total = await prisma.trainerPayoutRequest.count({ where });
    const totalPages = Math.ceil(total / limit);

    const requests = await prisma.trainerPayoutRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit
    });

    const formatted = requests.map(r => ({
      id: r.id,
      requestedAmountPaise: r.requestedAmountPaise,
      status: r.status,
      requestedDate: r.createdAt,
      utrReference: r.status === "paid" ? r.utrReference : null,
      manualPaidDate: r.status === "paid" ? r.manualPaidDate : null,
      adminNote: r.adminNote,
      rejectionReason: r.rejectionReason,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }));

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
    console.error("getPayoutRequests error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// 7. GET /api/trainer/payout-requests/:requestId
const getPayoutRequestById = async (req, res) => {
  try {
    const trainerId = validateTrainer(req, res);
    if (!trainerId) return;

    const { requestId } = req.params;
    const request = await prisma.trainerPayoutRequest.findUnique({
      where: { id: requestId }
    });

    if (!request) {
      return res.status(404).json({ success: false, message: "Payout request not found." });
    }

    if (request.trainerId !== trainerId) {
      return res.status(403).json({ success: false, message: "Access denied. You can only view your own payout requests." });
    }

    return res.status(200).json({
      success: true,
      data: request
    });
  } catch (error) {
    console.error("getPayoutRequestById error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// 8. POST /api/trainer/payout-requests
const createPayoutRequest = async (req, res) => {
  try {
    const trainerId = validateTrainer(req, res);
    if (!trainerId) return;

    const { amountPaise } = req.body;

    const balanceData = await getTrainerPayoutBalanceHelper(trainerId);

    if (!amountPaise || typeof amountPaise !== "number" || amountPaise < balanceData.minimumPayoutPaise) {
      return res.status(400).json({
        success: false,
        message: `Minimum payout amount is Rs. ${balanceData.minimumPayoutPaise / 100} (${balanceData.minimumPayoutPaise} paise).`
      });
    }

    if (!balanceData.account || balanceData.account.status !== "verified") {
      return res.status(400).json({
        success: false,
        message: "Your payout account must be verified before you can request a payout."
      });
    }

    if (balanceData.hasActiveRequest) {
      return res.status(400).json({
        success: false,
        message: "You already have an active payout request."
      });
    }

    if (amountPaise > balanceData.availableBalancePaise) {
      return res.status(400).json({
        success: false,
        message: "Requested amount exceeds your available balance."
      });
    }

    // Select subset of earnings to satisfy requested amount (using order by createdAt asc)
    const sortedAvailableEarnings = balanceData.unpaidEarnings
      .sort((a, b) => a.createdAt - b.createdAt);

    let selectedEarnings = [];
    let accumulated = 0;
    for (const e of sortedAvailableEarnings) {
      selectedEarnings.push(e);
      accumulated += e.finalPayablePaise;
      if (accumulated >= amountPaise) {
        break;
      }
    }

    const decrypted = decrypt(balanceData.account.accountNumber);
    const masked = maskAccountNumber(decrypted);

    const snapshot = {
      bankName: balanceData.account.bankName,
      accountNumberLast4: balanceData.account.accountNumberLast4,
      maskedAccountNumber: masked
    };

    const trainerUser = await prisma.user.findUnique({
      where: { id: trainerId }
    });
    const trainerName = trainerUser ? trainerUser.fullName : "Trainer";

    const newRequest = await prisma.$transaction(async (tx) => {
      const request = await tx.trainerPayoutRequest.create({
        data: {
          trainerId,
          trainerName,
          requestedAmountPaise: amountPaise,
          availableBalanceAtRequestPaise: balanceData.availableBalancePaise,
          lockedAmountPaise: amountPaise,
          status: "requested",
          payoutAccountSnapshot: snapshot
        }
      });

      await tx.trainerEarning.updateMany({
        where: {
          id: { in: selectedEarnings.map(e => e.id) }
        },
        data: {
          payoutRequestId: request.id,
          status: "requested",
          lockedAmountPaise: amountPaise
        }
      });

      await tx.trainerPayoutRequestHistory.create({
        data: {
          payoutRequestId: request.id,
          trainerId,
          action: "requested",
          oldStatus: "none",
          newStatus: "requested",
          adminId: null,
          adminName: null,
          note: "Payout request submitted by trainer."
        }
      });

      return request;
    });

    return res.status(201).json({
      success: true,
      data: {
        id: newRequest.id,
        requestedAmountPaise: newRequest.requestedAmountPaise,
        status: newRequest.status,
        requestedDate: newRequest.createdAt,
        payoutAccountSnapshot: newRequest.payoutAccountSnapshot,
        adminNote: newRequest.adminNote,
        rejectionReason: newRequest.rejectionReason,
        utrReference: newRequest.utrReference,
        manualPaidDate: newRequest.manualPaidDate,
        createdAt: newRequest.createdAt,
        updatedAt: newRequest.updatedAt
      }
    });
  } catch (error) {
    console.error("createPayoutRequest error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

module.exports = {
  getPaymentSummary,
  getPayoutBalance,
  getSessionEarnings,
  getPayoutAccount,
  createPayoutAccount,
  updatePayoutAccount,
  getPayoutRequests,
  getPayoutRequestById,
  createPayoutRequest
};
