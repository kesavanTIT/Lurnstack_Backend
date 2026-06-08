const prisma = require("../config/db");
const { encrypt, decrypt, maskAccountNumber } = require("../utils/encryption");

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

// 17. GET /api/trainer/payout-balance
const getPayoutBalance = async (req, res) => {
  try {
    const trainerId = validateTrainer(req, res);
    if (!trainerId) return;

    const now = new Date();
    const boundary = getBoundaryStartDate(now);

    const earnings = await prisma.trainerEarning.findMany({
      where: { trainerId },
      include: { session: { select: { status: true } } }
    });

    const activeRequest = await prisma.trainerPayoutRequest.findFirst({
      where: {
        trainerId,
        status: { in: ["requested", "approved", "processing"] }
      }
    });

    let availableBalancePaise = 0;
    let lockedAmountPaise = 0;
    let paidAmountPaise = 0;

    for (const e of earnings) {
      if (e.status === "unpaid" && e.session?.status === "ended" && e.createdAt < boundary) {
        availableBalancePaise += e.trainerEarningPaise;
      }
      if (["requested", "approved", "processing"].includes(e.status)) {
        lockedAmountPaise += e.trainerEarningPaise;
      }
      if (e.status === "paid") {
        paidAmountPaise += e.trainerEarningPaise;
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        availableBalancePaise,
        lockedAmountPaise,
        paidAmountPaise,
        minimumPayoutPaise: 50000,
        payoutCycleDays: 15,
        hasActiveRequest: !!activeRequest,
        activeRequestStatus: activeRequest ? activeRequest.status : null
      }
    });
  } catch (error) {
    console.error("getPayoutBalance error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// 18. GET /api/trainer/payout-account
const getPayoutAccount = async (req, res) => {
  try {
    const trainerId = validateTrainer(req, res);
    if (!trainerId) return;

    const account = await prisma.trainerPayoutAccount.findUnique({
      where: { trainerId }
    });

    if (!account) {
      return res.status(200).json({ success: true, data: null });
    }

    const decrypted = decrypt(account.accountNumber);
    const masked = maskAccountNumber(decrypted);

    return res.status(200).json({
      success: true,
      data: {
        accountHolderName: account.accountHolderName,
        bankName: account.bankName,
        maskedAccountNumber: masked,
        accountNumberLast4: account.accountNumberLast4,
        ifsc: account.ifsc,
        upiId: account.upiId,
        pan: account.pan,
        phoneNumber: account.phoneNumber,
        status: account.status,
        rejectionReason: account.rejectionReason,
        isLocked: account.isLocked
      }
    });
  } catch (error) {
    console.error("getPayoutAccount error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// 19. POST /api/trainer/payout-account
const createPayoutAccount = async (req, res) => {
  try {
    const trainerId = validateTrainer(req, res);
    if (!trainerId) return;

    const { accountHolderName, bankName, accountNumber, ifsc, upiId, pan, phoneNumber } = req.body;

    if (!accountHolderName || !bankName || !accountNumber || !ifsc || !pan || !phoneNumber) {
      return res.status(400).json({ success: false, message: "Missing required fields." });
    }

    // Cannot submit if trainer has active payout request
    const activeRequest = await prisma.trainerPayoutRequest.findFirst({
      where: {
        trainerId,
        status: { in: ["requested", "approved", "processing"] }
      }
    });

    if (activeRequest) {
      return res.status(400).json({
        success: false,
        message: "Cannot submit or update payout account while there is an active payout request."
      });
    }

    const existingAccount = await prisma.trainerPayoutAccount.findUnique({
      where: { trainerId }
    });

    if (existingAccount) {
      return res.status(400).json({
        success: false,
        message: "Payout account already exists. Use PATCH to update it."
      });
    }

    const encrypted = encrypt(accountNumber);
    const accountNumberLast4 = accountNumber.slice(-4);

    const account = await prisma.trainerPayoutAccount.create({
      data: {
        trainerId,
        accountHolderName,
        bankName,
        accountNumber: encrypted,
        accountNumberLast4,
        ifsc,
        upiId,
        pan,
        phoneNumber,
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

    const masked = maskAccountNumber(accountNumber);

    return res.status(201).json({
      success: true,
      data: {
        accountHolderName: account.accountHolderName,
        bankName: account.bankName,
        maskedAccountNumber: masked,
        accountNumberLast4: account.accountNumberLast4,
        ifsc: account.ifsc,
        upiId: account.upiId,
        pan: account.pan,
        phoneNumber: account.phoneNumber,
        status: account.status,
        rejectionReason: account.rejectionReason,
        isLocked: account.isLocked
      }
    });
  } catch (error) {
    console.error("createPayoutAccount error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// 20. PATCH /api/trainer/payout-account
const updatePayoutAccount = async (req, res) => {
  try {
    const trainerId = validateTrainer(req, res);
    if (!trainerId) return;

    const { accountHolderName, bankName, accountNumber, ifsc, upiId, pan, phoneNumber } = req.body;

    // Cannot change if trainer has active payout request
    const activeRequest = await prisma.trainerPayoutRequest.findFirst({
      where: {
        trainerId,
        status: { in: ["requested", "approved", "processing"] }
      }
    });

    if (activeRequest) {
      return res.status(400).json({
        success: false,
        message: "Cannot submit or update payout account while there is an active payout request."
      });
    }

    const existingAccount = await prisma.trainerPayoutAccount.findUnique({
      where: { trainerId }
    });

    if (!existingAccount) {
      return res.status(404).json({
        success: false,
        message: "Payout account not found. Please submit account details first."
      });
    }

    const updateData = {};
    if (accountHolderName !== undefined) updateData.accountHolderName = accountHolderName;
    if (bankName !== undefined) updateData.bankName = bankName;
    if (ifsc !== undefined) updateData.ifsc = ifsc;
    if (upiId !== undefined) updateData.upiId = upiId;
    if (pan !== undefined) updateData.pan = pan;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;

    if (accountNumber !== undefined) {
      updateData.accountNumber = encrypt(accountNumber);
      updateData.accountNumberLast4 = accountNumber.slice(-4);
    }

    // Any update resets status to pending
    const oldStatus = existingAccount.status;
    updateData.status = "pending";
    updateData.rejectionReason = null;

    const updated = await prisma.trainerPayoutAccount.update({
      where: { trainerId },
      data: updateData
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

    const decrypted = decrypt(updated.accountNumber);
    const masked = maskAccountNumber(decrypted);

    return res.status(200).json({
      success: true,
      data: {
        accountHolderName: updated.accountHolderName,
        bankName: updated.bankName,
        maskedAccountNumber: masked,
        accountNumberLast4: updated.accountNumberLast4,
        ifsc: updated.ifsc,
        upiId: updated.upiId,
        pan: updated.pan,
        phoneNumber: updated.phoneNumber,
        status: updated.status,
        rejectionReason: updated.rejectionReason,
        isLocked: updated.isLocked
      }
    });
  } catch (error) {
    console.error("updatePayoutAccount error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// 21. GET /api/trainer/payout-requests
const getPayoutRequests = async (req, res) => {
  try {
    const trainerId = validateTrainer(req, res);
    if (!trainerId) return;

    const { status } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
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
      utrReference: r.status === "paid" ? r.utrReference : undefined,
      manualPaidDate: r.status === "paid" ? r.manualPaidDate : undefined,
      adminNote: r.status === "rejected" ? r.rejectionReason : r.adminNote
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

// 22. GET /api/trainer/payout-requests/:requestId
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

// 23. POST /api/trainer/payout-requests
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
      accountHolderName: account.accountHolderName,
      bankName: account.bankName,
      maskedAccountNumber: masked,
      accountNumberLast4: account.accountNumberLast4,
      ifsc: account.ifsc,
      upiId: account.upiId,
      pan: account.pan,
      phoneNumber: account.phoneNumber,
      accountType: "bank_account"
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
          lockedAmountPaise: amountPaise // mark locked on earning
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
      data: newRequest
    });
  } catch (error) {
    console.error("createPayoutRequest error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

module.exports = {
  getPayoutBalance,
  getPayoutAccount,
  createPayoutAccount,
  updatePayoutAccount,
  getPayoutRequests,
  getPayoutRequestById,
  createPayoutRequest
};
