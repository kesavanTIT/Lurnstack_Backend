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
      where: { trainerId },
      include: { session: { select: { status: true } } }
    });

    const payoutRequests = await prisma.trainerPayoutRequest.findMany({
      where: { trainerId }
    });

    const activeRequest = payoutRequests.find(pr => ["requested", "approved", "processing"].includes(pr.status));
    const hasActiveRequest = !!activeRequest;
    const activeRequestStatus = activeRequest ? activeRequest.status : null;

    const now = new Date();
    const boundary = getBoundaryStartDate(now);

    let totalEarningsPaise = 0;
    let pendingEarningsPaise = 0;
    let availableBalancePaise = 0;
    let lockedAmountPaise = 0;
    let requestedAmountPaise = 0;
    let paidAmountPaise = 0;

    for (const e of earnings) {
      if (e.status === "rejected" || e.status === "adjusted") {
        continue;
      }
      const amount = e.trainerEarningPaise;
      totalEarningsPaise += amount;

      if (e.status === "paid") {
        paidAmountPaise += amount;
      } else if (["requested", "approved", "processing"].includes(e.status)) {
        lockedAmountPaise += amount;
        if (e.status === "requested") {
          requestedAmountPaise += amount;
        }
      } else if (e.status === "unpaid") {
        if (e.session?.status === "ended" && e.createdAt < boundary) {
          availableBalancePaise += amount;
        } else {
          pendingEarningsPaise += amount;
        }
      }
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
    } else if (availableBalancePaise < 50000) {
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
        minimumPayoutPaise: 50000,
        payoutCycleDays: 15,
        cycleStart: formatDate(cycleStart),
        cycleEnd: formatDate(cycleEnd),
        nextPayoutDate: formatDate(nextPayoutDate),
        isPayoutWindowOpen,
        hasActiveRequest,
        activeRequestStatus,
        payoutBlockReason,
        payoutAccountStatus
      }
    });
  } catch (error) {
    console.error("getPaymentSummary error:", error);
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

    const { amountPaise } = req.body;
    if (!amountPaise || typeof amountPaise !== "number" || amountPaise < 50000) {
      return res.status(400).json({
        success: false,
        message: "Minimum payout amount is Rs. 500 (50000 paise)."
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

    const now = new Date();
    const boundary = getBoundaryStartDate(now);

    const availableEarnings = await prisma.trainerEarning.findMany({
      where: {
        trainerId,
        status: "unpaid",
        session: { status: "ended" },
        createdAt: { lt: boundary }
      },
      orderBy: { createdAt: "asc" }
    });

    const availableBalancePaise = availableEarnings.reduce((sum, e) => sum + e.trainerEarningPaise, 0);

    if (amountPaise > availableBalancePaise) {
      return res.status(400).json({
        success: false,
        message: "Requested amount exceeds your available cycle-cleared balance."
      });
    }

    // Select subset of earnings to satisfy requested amount
    let selectedEarnings = [];
    let accumulated = 0;
    for (const e of availableEarnings) {
      selectedEarnings.push(e);
      accumulated += e.trainerEarningPaise;
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
  getSessionEarnings,
  getPayoutAccount,
  createPayoutAccount,
  updatePayoutAccount,
  getPayoutRequests,
  getPayoutRequestById,
  createPayoutRequest
};
