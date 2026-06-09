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

// 1. GET /api/trainer/payment-summary
const getPaymentSummary = async (req, res) => {
  try {
    const trainerId = validateTrainer(req, res);
    if (!trainerId) return;

    const account = await prisma.trainerPayoutAccount.findUnique({
      where: { trainerId }
    });
    const payoutAccountStatus = account ? account.status : "missing";

    const earnings = await prisma.trainerEarning.findMany({
      where: { trainerId }
    });

    const activePayoutRequests = await prisma.trainerPayoutRequest.findMany({
      where: {
        trainerId,
        status: { in: ["requested", "approved", "processing"] }
      }
    });

    const lockedAmountPaise = activePayoutRequests.reduce((sum, r) => sum + r.requestedAmountPaise, 0);
    const hasActiveRequest = activePayoutRequests.length > 0;
    const activeRequest = activePayoutRequests[0];
    const activeRequestStatus = activeRequest ? activeRequest.status : null;

    const now = new Date();
    const boundary = getBoundaryStartDate(now);

    const PAYOUT_TEST_MODE = process.env.PAYOUT_TEST_MODE === "true";
    const TEST_PAYOUT_IGNORE_MINIMUM = process.env.TEST_PAYOUT_IGNORE_MINIMUM === "true";
    const minimumPayoutPaise = (PAYOUT_TEST_MODE && TEST_PAYOUT_IGNORE_MINIMUM) ? 0 : 50000;

    let totalEarningsPaise = 0;
    let paidAmountPaise = 0;
    let requestedAmountPaise = 0;

    const unpaidEarnings = earnings.filter(e => e.status === "unpaid");
    const totalUnpaidEarningsPaise = unpaidEarnings.reduce((sum, e) => sum + e.finalPayablePaise, 0);

    for (const e of earnings) {
      if (e.status === "rejected" || e.status === "adjusted") {
        continue;
      }
      const amount = e.finalPayablePaise;
      totalEarningsPaise += amount;

      if (e.status === "paid") {
        paidAmountPaise += amount;
      } else if (e.status === "requested") {
        requestedAmountPaise += amount;
      }
    }

    let cycleClearedEarningsPaise = 0;
    let pendingEarningsPaise = 0;
    let isCycleOpen = true;

    if (PAYOUT_TEST_MODE) {
      cycleClearedEarningsPaise = totalUnpaidEarningsPaise;
      pendingEarningsPaise = 0;
      isCycleOpen = true;
    } else {
      cycleClearedEarningsPaise = unpaidEarnings
        .filter(e => e.createdAt < boundary)
        .reduce((sum, e) => sum + e.finalPayablePaise, 0);
      pendingEarningsPaise = totalUnpaidEarningsPaise - cycleClearedEarningsPaise;
      isCycleOpen = (cycleClearedEarningsPaise > 0 || totalUnpaidEarningsPaise === 0);
    }

    let availableBalancePaise = 0;
    if (!isCycleOpen) {
      availableBalancePaise = 0;
      pendingEarningsPaise = totalUnpaidEarningsPaise;
    } else {
      availableBalancePaise = Math.max(cycleClearedEarningsPaise - lockedAmountPaise, 0);
    }

    const { cycleStart, cycleEnd, nextPayoutDate } = getCurrentCycleInfo(now);

    let payoutBlockReason = null;
    if (payoutAccountStatus === "missing") {
      payoutBlockReason = "NO_PAYOUT_ACCOUNT";
    } else if (payoutAccountStatus === "pending") {
      payoutBlockReason = "ACCOUNT_PENDING_VERIFICATION";
    } else if (payoutAccountStatus === "rejected") {
      payoutBlockReason = "ACCOUNT_REJECTED";
    } else if (hasActiveRequest) {
      payoutBlockReason = "ACTIVE_REQUEST_EXISTS";
    } else if (!isCycleOpen) {
      payoutBlockReason = "PAYOUT_CYCLE_NOT_OPEN";
    } else if (availableBalancePaise < minimumPayoutPaise) {
      payoutBlockReason = "INSUFFICIENT_BALANCE";
    }

    const isPayoutWindowOpen = !payoutBlockReason;

    return res.status(200).json({
      success: true,
      data: {
        totalEarningsPaise,
        pendingEarningsPaise,
        availableBalancePaise,
        lockedAmountPaise,
        requestedAmountPaise,
        paidAmountPaise,
        minimumPayoutPaise,
        payoutCycleDays: 15,
        cycleStart: formatDate(cycleStart),
        cycleEnd: formatDate(cycleEnd),
        nextPayoutDate: formatDate(nextPayoutDate),
        isPayoutWindowOpen,
        hasActiveRequest,
        activeRequestStatus,
        payoutBlockReason,
        payoutAccountStatus,
        testMode: PAYOUT_TEST_MODE
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

    const PAYOUT_TEST_MODE = process.env.PAYOUT_TEST_MODE === "true";
    const TEST_PAYOUT_IGNORE_MINIMUM = process.env.TEST_PAYOUT_IGNORE_MINIMUM === "true";
    const minimumPayoutPaise = (PAYOUT_TEST_MODE && TEST_PAYOUT_IGNORE_MINIMUM) ? 0 : 50000;

    const unpaidEarnings = await prisma.trainerEarning.findMany({
      where: {
        trainerId,
        status: "unpaid"
      }
    });

    const activePayoutRequests = await prisma.trainerPayoutRequest.findMany({
      where: {
        trainerId,
        status: { in: ["requested", "approved", "processing"] }
      }
    });

    const lockedAmountPaise = activePayoutRequests.reduce((sum, r) => sum + r.requestedAmountPaise, 0);
    const hasActiveRequest = activePayoutRequests.length > 0;

    const now = new Date();
    const boundary = getBoundaryStartDate(now);
    const { cycleStart, cycleEnd } = getCurrentCycleInfo(now);

    const totalUnpaidEarningsPaise = unpaidEarnings.reduce((sum, e) => sum + e.finalPayablePaise, 0);

    let cycleClearedEarningsPaise = 0;
    let pendingCycleEarningsPaise = 0;
    let isCycleOpen = true;

    if (PAYOUT_TEST_MODE) {
      cycleClearedEarningsPaise = totalUnpaidEarningsPaise;
      pendingCycleEarningsPaise = 0;
      isCycleOpen = true;
    } else {
      cycleClearedEarningsPaise = unpaidEarnings
        .filter(e => e.createdAt < boundary)
        .reduce((sum, e) => sum + e.finalPayablePaise, 0);
      pendingCycleEarningsPaise = totalUnpaidEarningsPaise - cycleClearedEarningsPaise;
      isCycleOpen = (cycleClearedEarningsPaise > 0 || totalUnpaidEarningsPaise === 0);
    }

    let availableBalancePaise = 0;
    if (!isCycleOpen) {
      availableBalancePaise = 0;
      pendingCycleEarningsPaise = totalUnpaidEarningsPaise;
    } else {
      availableBalancePaise = Math.max(cycleClearedEarningsPaise - lockedAmountPaise, 0);
    }

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
    } else if (!isCycleOpen) {
      blockReason = "PAYOUT_CYCLE_NOT_OPEN";
    } else if (availableBalancePaise < minimumPayoutPaise) {
      blockReason = "INSUFFICIENT_BALANCE";
    }

    const canRequest = !blockReason;

    return res.status(200).json({
      success: true,
      data: {
        totalUnpaidEarningsPaise,
        cycleClearedEarningsPaise,
        pendingCycleEarningsPaise,
        lockedAmountPaise,
        availableBalancePaise,
        minimumPayoutPaise,
        cycleStartDate: formatDate(cycleStart),
        cycleEndDate: formatDate(cycleEnd),
        isCycleOpen,
        hasActiveRequest,
        canRequest,
        blockReason,
        testMode: PAYOUT_TEST_MODE
      }
    });
  } catch (error) {
    console.error("getPayoutBalance error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// 2. GET /api/trainer/session-earnings
const getSessionEarnings = async (req, res) => {
  try {
    const trainerId = validateTrainer(req, res);
    if (!trainerId) return;

    const { status, search } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 100;
    const skip = (page - 1) * limit;

    const where = { trainerId };
    if (status) {
      where.status = status;
    }
    if (search) {
      where.sessionTitle = { contains: search, mode: "insensitive" };
    }

    const total = await prisma.trainerEarning.count({ where });
    const totalPages = Math.ceil(total / limit);

    const earnings = await prisma.trainerEarning.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit
    });

    const formatted = earnings.map(e => ({
      id: e.id,
      sessionId: e.sessionId,
      sessionTitle: e.sessionTitle,
      paidStudentCount: e.paidStudentCount,
      sessionPricePaise: e.sessionPricePaise,
      trainerSharePercentage: e.trainerSharePercentage,
      trainerEarningPaise: e.trainerEarningPaise,
      refundAdjustmentPaise: e.refundAdjustmentPaise,
      finalPayablePaise: e.finalPayablePaise,
      status: e.status,
      availableFrom: e.availableAfter || e.createdAt,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt
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

    const PAYOUT_TEST_MODE = process.env.PAYOUT_TEST_MODE === "true";
    const TEST_PAYOUT_IGNORE_MINIMUM = process.env.TEST_PAYOUT_IGNORE_MINIMUM === "true";
    const minimumPayoutPaise = (PAYOUT_TEST_MODE && TEST_PAYOUT_IGNORE_MINIMUM) ? 0 : 50000;

    const { amountPaise } = req.body;
    if (!amountPaise || typeof amountPaise !== "number" || amountPaise < minimumPayoutPaise) {
      return res.status(400).json({
        success: false,
        message: `Minimum payout amount is Rs. ${minimumPayoutPaise / 100} (${minimumPayoutPaise} paise).`
      });
    }

    const account = await prisma.trainerPayoutAccount.findUnique({
      where: { trainerId }
    });

    if (!account || account.status !== "verified") {
      return res.status(400).json({
        success: false,
        message: "Your payout account must be verified before you can request a payout."
      });
    }

    const activeRequest = await prisma.trainerPayoutRequest.findFirst({
      where: {
        trainerId,
        status: { in: ["requested", "approved", "processing"] }
      }
    });

    if (activeRequest) {
      return res.status(400).json({
        success: false,
        message: "You already have an active payout request."
      });
    }

    const unpaidEarnings = await prisma.trainerEarning.findMany({
      where: {
        trainerId,
        status: "unpaid"
      }
    });

    const totalUnpaidEarningsPaise = unpaidEarnings.reduce((sum, e) => sum + e.finalPayablePaise, 0);

    const now = new Date();
    const boundary = getBoundaryStartDate(now);

    let cycleClearedEarningsPaise = 0;
    let isCycleOpen = true;

    if (PAYOUT_TEST_MODE) {
      cycleClearedEarningsPaise = totalUnpaidEarningsPaise;
      isCycleOpen = true;
    } else {
      cycleClearedEarningsPaise = unpaidEarnings
        .filter(e => e.createdAt < boundary)
        .reduce((sum, e) => sum + e.finalPayablePaise, 0);
      isCycleOpen = (cycleClearedEarningsPaise > 0 || totalUnpaidEarningsPaise === 0);
    }

    if (!isCycleOpen) {
      return res.status(400).json({
        success: false,
        message: "The payout cycle is not open."
      });
    }

    // Now calculate actual requestable balance by subtracting locked amount
    const activePayoutRequests = await prisma.trainerPayoutRequest.findMany({
      where: {
        trainerId,
        status: { in: ["requested", "approved", "processing"] }
      }
    });
    const lockedAmountPaise = activePayoutRequests.reduce((sum, r) => sum + r.requestedAmountPaise, 0);

    const availableBalancePaise = Math.max(cycleClearedEarningsPaise - lockedAmountPaise, 0);

    if (amountPaise > availableBalancePaise) {
      return res.status(400).json({
        success: false,
        message: "Requested amount exceeds your available cycle-cleared balance."
      });
    }

    // Select subset of earnings to satisfy requested amount (using order by createdAt asc)
    const sortedAvailableEarnings = unpaidEarnings
      .filter(e => PAYOUT_TEST_MODE || e.createdAt < boundary)
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

    const decrypted = decrypt(account.accountNumber);
    const masked = maskAccountNumber(decrypted);

    const snapshot = {
      bankName: account.bankName,
      accountNumberLast4: account.accountNumberLast4,
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
          availableBalanceAtRequestPaise: availableBalancePaise,
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
