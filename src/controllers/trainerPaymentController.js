const prisma = require("../config/db");
const { encrypt, decrypt, maskAccountNumber } = require("../utils/encryption");

// Helper to get clearing date based on 15-day cycle in Asia/Kolkata timezone
const getClearingDate = (dateInput) => {
  const date = new Date(dateInput);
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
    return new Date(`${year}-${String(month).padStart(2, '0')}-16T00:00:00+05:30`);
  } else {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    return new Date(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00+05:30`);
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

// Helper to get boundary start date for uncleared earnings
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

// ─────────────────────────────────────────────
// 1. GET /api/trainer/payment-summary
// ─────────────────────────────────────────────
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
      include: { payoutRequest: true }
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

    for (const earning of earnings) {
      if (earning.status === "failed" || earning.status === "cancelled") {
        continue;
      }

      const amount = earning.trainerAmountPaise;
      totalEarningsPaise += amount;

      if (earning.status === "pending_session_completion") {
        pendingEarningsPaise += amount;
        continue;
      }

      if (earning.payoutRequest) {
        const prStatus = earning.payoutRequest.status;
        if (["requested", "approved", "processing"].includes(prStatus)) {
          lockedAmountPaise += amount;
        }
        if (prStatus === "requested") {
          requestedAmountPaise += amount;
        }
        if (prStatus === "paid") {
          paidAmountPaise += amount;
        }
      } else {
        if (earning.status === "payable") {
          if (earning.createdAt < boundary) {
            availableBalancePaise += amount;
          } else {
            pendingEarningsPaise += amount;
          }
        } else if (earning.status === "paid") {
          paidAmountPaise += amount;
        } else if (earning.status === "processing") {
          lockedAmountPaise += amount;
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
        cycleStart,
        cycleEnd,
        nextPayoutDate,
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

// ─────────────────────────────────────────────
// 2. GET /api/trainer/session-earnings
// ─────────────────────────────────────────────
const getSessionEarnings = async (req, res) => {
  try {
    const trainerId = validateTrainer(req, res);
    if (!trainerId) return;

    const { status, search } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const where = { trainerId };

    if (search) {
      where.session = {
        title: {
          contains: search,
          mode: "insensitive"
        }
      };
    }

    const now = new Date();
    const boundary = getBoundaryStartDate(now);

    if (status) {
      if (status === "pending") {
        where.OR = [
          { status: "pending_session_completion" },
          { status: "payable", createdAt: { gte: boundary } }
        ];
      } else if (status === "available") {
        where.status = "payable";
        where.createdAt = { lt: boundary };
        where.payoutRequestId = null;
      } else if (status === "requested") {
        where.payoutRequest = { status: "requested" };
      } else if (status === "approved") {
        where.payoutRequest = { status: "approved" };
      } else if (status === "processing") {
        where.OR = [
          { payoutRequest: { status: "processing" } },
          { status: "processing" }
        ];
      } else if (status === "paid") {
        where.OR = [
          { payoutRequest: { status: "paid" } },
          { status: "paid" }
        ];
      } else if (status === "rejected") {
        where.OR = [
          { payoutRequest: { status: "rejected" } },
          { status: "failed" }
        ];
      } else if (status === "adjusted") {
        where.status = { in: ["on_hold", "cancelled"] };
      }
    }

    const total = await prisma.trainerEarning.count({ where });
    const totalPages = Math.ceil(total / limit);

    const earnings = await prisma.trainerEarning.findMany({
      where,
      include: {
        session: true,
        payoutRequest: true
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit
    });

    const mappedEarnings = earnings.map(earning => {
      let finalStatus = "pending";
      if (earning.payoutRequest) {
        const prStatus = earning.payoutRequest.status;
        if (prStatus === "requested") finalStatus = "requested";
        else if (prStatus === "approved") finalStatus = "approved";
        else if (prStatus === "processing") finalStatus = "processing";
        else if (prStatus === "paid") finalStatus = "paid";
        else if (prStatus === "rejected") finalStatus = "rejected";
      } else {
        if (earning.status === "pending_session_completion") {
          finalStatus = "pending";
        } else if (earning.status === "payable") {
          if (earning.createdAt < boundary) {
            finalStatus = "available";
          } else {
            finalStatus = "pending";
          }
        } else if (earning.status === "paid") {
          finalStatus = "paid";
        } else if (earning.status === "processing") {
          finalStatus = "processing";
        } else if (["on_hold", "cancelled"].includes(earning.status)) {
          finalStatus = "adjusted";
        } else if (earning.status === "failed") {
          finalStatus = "rejected";
        }
      }

      // Calculate share percent dynamically if possible
      const gross = earning.grossAmountPaise || 1;
      const trainerSharePercentage = parseFloat(((earning.trainerAmountPaise / gross) * 100).toFixed(2));

      return {
        id: earning.id,
        sessionId: earning.sessionId,
        sessionTitle: earning.session ? earning.session.title : "Live Session",
        paidStudentCount: 1,
        sessionPricePaise: earning.grossAmountPaise,
        trainerSharePercentage,
        trainerEarningPaise: earning.trainerAmountPaise,
        refundAdjustmentPaise: 0,
        finalPayablePaise: earning.trainerAmountPaise,
        status: finalStatus,
        availableFrom: getClearingDate(earning.createdAt),
        createdAt: earning.createdAt,
        updatedAt: earning.updatedAt
      };
    });

    return res.status(200).json({
      success: true,
      data: mappedEarnings,
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

// ─────────────────────────────────────────────
// 3. GET /api/trainer/payout-account
// ─────────────────────────────────────────────
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
        data: null
      });
    }

    const decrypted = decrypt(account.encryptedAccountNumber);
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
        accountType: account.accountType,
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

// ─────────────────────────────────────────────
// 4. POST /api/trainer/payout-account
// ─────────────────────────────────────────────
const createPayoutAccount = async (req, res) => {
  try {
    const trainerId = validateTrainer(req, res);
    if (!trainerId) return;

    const {
      accountHolderName,
      bankName,
      accountNumber,
      confirmAccountNumber,
      ifsc,
      ifscCode,
      upiId,
      pan,
      panNumber,
      phoneNumber,
      accountType
    } = req.body;

    if (!accountHolderName || !bankName || !accountNumber || !confirmAccountNumber || !phoneNumber) {
      return res.status(400).json({ success: false, message: "Missing required fields." });
    }

    if (accountNumber !== confirmAccountNumber) {
      return res.status(400).json({ success: false, message: "Account numbers do not match." });
    }

    // Reject if active payout request exists
    const activePayout = await prisma.trainerPayoutRequest.findFirst({
      where: {
        trainerId,
        status: { in: ["requested", "approved", "processing"] }
      }
    });

    if (activePayout) {
      return res.status(400).json({
        success: false,
        message: "Cannot create or update payout account while there is an active payout request."
      });
    }

    // Check if account already exists
    const existingAccount = await prisma.trainerPayoutAccount.findUnique({
      where: { trainerId }
    });

    if (existingAccount) {
      return res.status(400).json({
        success: false,
        message: "Payout account already exists. Use PATCH to update it."
      });
    }

    const encryptedAccountNumber = encrypt(accountNumber);
    const accountNumberLast4 = accountNumber.slice(-4);
    const ifscToStore = ifsc || ifscCode;
    const panToStore = pan || panNumber;

    const newAccount = await prisma.trainerPayoutAccount.create({
      data: {
        trainerId,
        accountHolderName,
        bankName,
        encryptedAccountNumber,
        accountNumberLast4,
        ifsc: ifscToStore,
        upiId,
        pan: panToStore,
        phoneNumber,
        accountType: accountType || "bank_account",
        status: "pending"
      }
    });

    return res.status(201).json({
      success: true,
      data: {
        id: newAccount.id,
        accountHolderName: newAccount.accountHolderName,
        bankName: newAccount.bankName,
        maskedAccountNumber: maskAccountNumber(accountNumber),
        accountNumberLast4: newAccount.accountNumberLast4,
        ifsc: newAccount.ifsc,
        upiId: newAccount.upiId,
        pan: newAccount.pan,
        phoneNumber: newAccount.phoneNumber,
        accountType: newAccount.accountType,
        status: newAccount.status,
        rejectionReason: newAccount.rejectionReason,
        isLocked: newAccount.isLocked,
        createdAt: newAccount.createdAt,
        updatedAt: newAccount.updatedAt
      }
    });
  } catch (error) {
    console.error("createPayoutAccount error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// 5. PATCH /api/trainer/payout-account
// ─────────────────────────────────────────────
const updatePayoutAccount = async (req, res) => {
  try {
    const trainerId = validateTrainer(req, res);
    if (!trainerId) return;

    const {
      accountHolderName,
      bankName,
      accountNumber,
      confirmAccountNumber,
      ifsc,
      ifscCode,
      upiId,
      pan,
      panNumber,
      phoneNumber,
      accountType
    } = req.body;

    // Reject if active payout request exists
    const activePayout = await prisma.trainerPayoutRequest.findFirst({
      where: {
        trainerId,
        status: { in: ["requested", "approved", "processing"] }
      }
    });

    if (activePayout) {
      return res.status(400).json({
        success: false,
        message: "Cannot create or update payout account while there is an active payout request."
      });
    }

    const existingAccount = await prisma.trainerPayoutAccount.findUnique({
      where: { trainerId }
    });

    if (!existingAccount) {
      return res.status(404).json({
        success: false,
        message: "Payout account not found. Please create one first."
      });
    }

    const updateData = {};
    if (accountHolderName !== undefined) updateData.accountHolderName = accountHolderName;
    if (bankName !== undefined) updateData.bankName = bankName;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
    if (accountType !== undefined) updateData.accountType = accountType;
    if (upiId !== undefined) updateData.upiId = upiId;

    const ifscToStore = ifsc || ifscCode;
    if (ifscToStore !== undefined) updateData.ifsc = ifscToStore;

    const panToStore = pan || panNumber;
    if (panToStore !== undefined) updateData.pan = panToStore;

    if (accountNumber !== undefined || confirmAccountNumber !== undefined) {
      if (!accountNumber || !confirmAccountNumber) {
        return res.status(400).json({
          success: false,
          message: "Both accountNumber and confirmAccountNumber must be provided to update the account number."
        });
      }
      if (accountNumber !== confirmAccountNumber) {
        return res.status(400).json({
          success: false,
          message: "Account numbers do not match."
        });
      }
      updateData.encryptedAccountNumber = encrypt(accountNumber);
      updateData.accountNumberLast4 = accountNumber.slice(-4);
    }

    // Any update resets status to pending and clears rejectionReason
    updateData.status = "pending";
    updateData.rejectionReason = null;

    const updatedAccount = await prisma.trainerPayoutAccount.update({
      where: { trainerId },
      data: updateData
    });

    const decrypted = decrypt(updatedAccount.encryptedAccountNumber);
    const masked = maskAccountNumber(decrypted);

    return res.status(200).json({
      success: true,
      data: {
        id: updatedAccount.id,
        accountHolderName: updatedAccount.accountHolderName,
        bankName: updatedAccount.bankName,
        maskedAccountNumber: masked,
        accountNumberLast4: updatedAccount.accountNumberLast4,
        ifsc: updatedAccount.ifsc,
        upiId: updatedAccount.upiId,
        pan: updatedAccount.pan,
        phoneNumber: updatedAccount.phoneNumber,
        accountType: updatedAccount.accountType,
        status: updatedAccount.status,
        rejectionReason: updatedAccount.rejectionReason,
        isLocked: updatedAccount.isLocked,
        createdAt: updatedAccount.createdAt,
        updatedAt: updatedAccount.updatedAt
      }
    });
  } catch (error) {
    console.error("updatePayoutAccount error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// 6. POST /api/trainer/payout-requests
// ─────────────────────────────────────────────
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
        status: "payable",
        createdAt: { lt: boundary },
        payoutRequestId: null
      },
      orderBy: { createdAt: "asc" }
    });

    const availableBalancePaise = availableEarnings.reduce((sum, e) => sum + e.trainerAmountPaise, 0);

    if (amountPaise > availableBalancePaise) {
      return res.status(400).json({
        success: false,
        message: "Requested amount exceeds your available cycle-cleared balance."
      });
    }

    // Select subset of earnings to satisfy the requested amount
    let selectedEarnings = [];
    let accumulated = 0;
    for (const earning of availableEarnings) {
      selectedEarnings.push(earning);
      accumulated += earning.trainerAmountPaise;
      if (accumulated >= amountPaise) {
        break;
      }
    }

    const decryptedAcc = decrypt(account.encryptedAccountNumber);
    const maskedAcc = maskAccountNumber(decryptedAcc);

    const payoutAccountSnapshot = {
      accountHolderName: account.accountHolderName,
      bankName: account.bankName,
      maskedAccountNumber: maskedAcc,
      accountNumberLast4: account.accountNumberLast4,
      ifsc: account.ifsc,
      upiId: account.upiId,
      pan: account.pan,
      phoneNumber: account.phoneNumber,
      accountType: account.accountType
    };

    const newRequest = await prisma.$transaction(async (tx) => {
      const request = await tx.trainerPayoutRequest.create({
        data: {
          trainerId,
          requestedAmountPaise: amountPaise,
          status: "requested",
          payoutAccountSnapshot
        }
      });

      await tx.trainerEarning.updateMany({
        where: {
          id: { in: selectedEarnings.map(e => e.id) }
        },
        data: {
          payoutRequestId: request.id
        }
      });

      return request;
    });

    return res.status(201).json({
      success: true,
      data: newRequest
    });
  } catch (error) {
    console.error("createPayoutRequest error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// 7. GET /api/trainer/payout-requests
// ─────────────────────────────────────────────
const getPayoutRequests = async (req, res) => {
  try {
    const trainerId = validateTrainer(req, res);
    if (!trainerId) return;

    const { status } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const where = { trainerId };
    if (status) {
      where.status = status;
    }

    const total = await prisma.trainerPayoutRequest.count({ where });
    const totalPages = Math.ceil(total / limit);

    const requests = await prisma.trainerPayoutRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit
    });

    return res.status(200).json({
      success: true,
      data: requests,
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

// ─────────────────────────────────────────────
// 8. GET /api/trainer/payout-requests/:requestId
// ─────────────────────────────────────────────
const getPayoutRequestById = async (req, res) => {
  try {
    const trainerId = validateTrainer(req, res);
    if (!trainerId) return;

    const { requestId } = req.params;

    const request = await prisma.trainerPayoutRequest.findUnique({
      where: { id: requestId }
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Payout request not found."
      });
    }

    if (request.trainerId !== trainerId) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only access your own payout requests."
      });
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

module.exports = {
  getPaymentSummary,
  getSessionEarnings,
  getPayoutAccount,
  createPayoutAccount,
  updatePayoutAccount,
  createPayoutRequest,
  getPayoutRequests,
  getPayoutRequestById
};
