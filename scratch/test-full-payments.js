require("dotenv").config();
const prisma = require("../src/config/db");

// Import Admin controllers
const {
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
} = require("../src/controllers/adminPayoutController");

// Import Trainer controllers
const {
  getPaymentSummary,
  getPayoutAccount,
  createPayoutAccount,
  updatePayoutAccount,
  getPayoutRequests,
  getPayoutRequestById,
  createPayoutRequest
} = require("../src/controllers/trainerPaymentController");

const mockRes = () => {
  const res = {};
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.body = data;
    return res;
  };
  return res;
};

async function runTests() {
  console.log("Starting LurnStack Trainer Payout Backend Integration Tests...\n");

  // 1. Setup Test Users
  let testTrainer = await prisma.user.findFirst({ where: { email: "trainer_full_test@lurnstack.com" } });
  if (!testTrainer) {
    testTrainer = await prisma.user.create({
      data: {
        fullName: "Full Test Trainer",
        email: "trainer_full_test@lurnstack.com",
        password: "securepassword",
        role: "TRAINER",
        isActive: true
      }
    });
  } else {
    // Cleanup existing data
    await prisma.trainerEarning.deleteMany({ where: { trainerId: testTrainer.id } });
    await prisma.trainerPayoutRequestHistory.deleteMany({ where: { trainerId: testTrainer.id } });
    await prisma.trainerPayoutRequest.deleteMany({ where: { trainerId: testTrainer.id } });
    await prisma.trainerPayoutAccountHistory.deleteMany({ where: { trainerId: testTrainer.id } });
    await prisma.trainerPayoutAccount.deleteMany({ where: { trainerId: testTrainer.id } });
  }

  let testAdmin = await prisma.user.findFirst({ where: { email: "admin_full_test@lurnstack.com" } });
  if (!testAdmin) {
    testAdmin = await prisma.user.create({
      data: {
        fullName: "Full Test Admin",
        email: "admin_full_test@lurnstack.com",
        password: "securepassword",
        role: "ADMIN",
        isActive: true
      }
    });
  }

  const trainerReq = {
    user: { id: testTrainer.id, role: "trainer" },
    body: {},
    query: {},
    params: {}
  };

  const adminReq = {
    user: { id: testAdmin.id, role: "admin" },
    body: {},
    query: {},
    params: {}
  };

  // 2. Trainer creates payout account
  console.log("2. Trainer creates payout account...");
  trainerReq.body = {
    accountHolderName: "Full Test Trainer",
    bankName: "SBI Bank",
    accountNumber: "98765432109876",
    confirmAccountNumber: "98765432109876",
    ifsc: "SBIN0001234",
    pan: "ABCDE1234Z",
    phoneNumber: "9999988888"
  };
  let res = mockRes();
  await createPayoutAccount(trainerReq, res);
  if (res.statusCode !== 201 || res.body.data.status !== "pending") {
    throw new Error("Expected account creation to succeed with pending status");
  }

  // 3. Admin rejects account
  console.log("3. Admin rejects account...");
  const account = await prisma.trainerPayoutAccount.findUnique({ where: { trainerId: testTrainer.id } });
  adminReq.params = { accountId: account.id };
  adminReq.body = { reason: "Incorrect PAN details" };
  res = mockRes();
  await rejectAdminTrainerPayoutAccount(adminReq, res);
  if (res.statusCode !== 200 || res.body.data.status !== "rejected") {
    throw new Error("Expected account to be rejected");
  }

  // 4. Trainer updates account
  console.log("4. Trainer updates account...");
  trainerReq.body = { pan: "ABCDE5555Z" };
  res = mockRes();
  await updatePayoutAccount(trainerReq, res);
  if (res.statusCode !== 200 || res.body.data.status !== "pending") {
    throw new Error("Expected update to reset status to pending");
  }

  // 5. Admin verifies account
  console.log("5. Admin verifies account...");
  res = mockRes();
  await verifyAdminTrainerPayoutAccount(adminReq, res);
  if (res.statusCode !== 200 || res.body.data.status !== "verified") {
    throw new Error("Expected account to be verified");
  }

  // 6. Setup Mock Sessions and Earnings
  console.log("6. Setting up Mock Sessions and Earnings...");
  // Ended Session
  const endedSession = await prisma.liveSession.create({
    data: {
      trainerId: testTrainer.id,
      title: "Ended Live Session",
      priceInPaise: 100000,
      pricingState: "PRICED",
      publishState: "PUBLISHED",
      status: "ended"
    }
  });

  // Active Session
  const activeSession = await prisma.liveSession.create({
    data: {
      trainerId: testTrainer.id,
      title: "Active Live Session",
      priceInPaise: 100000,
      pricingState: "PRICED",
      publishState: "PUBLISHED",
      status: "active"
    }
  });

  // Booking details
  const past20Days = new Date();
  past20Days.setDate(past20Days.getDate() - 20);

  // Earning 1: Cleared (ended session, created 20 days ago)
  const earningCleared = await prisma.trainerEarning.create({
    data: {
      trainerId: testTrainer.id,
      trainerName: "Full Test Trainer",
      trainerEmail: "trainer_full_test@lurnstack.com",
      sessionId: endedSession.id,
      sessionTitle: "Ended Live Session",
      paidStudentCount: 1,
      sessionPricePaise: 100000,
      grossRevenuePaise: 100000,
      trainerSharePercentage: 60.0,
      trainerEarningPaise: 60000,
      platformSharePercentage: 40.0,
      platformEarningPaise: 40000,
      refundAdjustmentPaise: 0,
      finalPayablePaise: 60000,
      status: "unpaid",
      createdAt: past20Days,
      updatedAt: past20Days
    }
  });

  // Earning 2: Uncleared Cycle (ended session, created now)
  const earningUncleared = await prisma.trainerEarning.create({
    data: {
      trainerId: testTrainer.id,
      trainerName: "Full Test Trainer",
      trainerEmail: "trainer_full_test@lurnstack.com",
      sessionId: endedSession.id,
      sessionTitle: "Ended Live Session",
      paidStudentCount: 1,
      sessionPricePaise: 100000,
      grossRevenuePaise: 100000,
      trainerSharePercentage: 60.0,
      trainerEarningPaise: 60000,
      platformSharePercentage: 40.0,
      platformEarningPaise: 40000,
      refundAdjustmentPaise: 0,
      finalPayablePaise: 60000,
      status: "unpaid"
    }
  });

  // Earning 3: Active Session (uncompleted, created 20 days ago)
  const earningActiveSession = await prisma.trainerEarning.create({
    data: {
      trainerId: testTrainer.id,
      trainerName: "Full Test Trainer",
      trainerEmail: "trainer_full_test@lurnstack.com",
      sessionId: activeSession.id,
      sessionTitle: "Active Live Session",
      paidStudentCount: 1,
      sessionPricePaise: 100000,
      grossRevenuePaise: 100000,
      trainerSharePercentage: 60.0,
      trainerEarningPaise: 60000,
      platformSharePercentage: 40.0,
      platformEarningPaise: 40000,
      refundAdjustmentPaise: 0,
      finalPayablePaise: 60000,
      status: "unpaid",
      createdAt: past20Days,
      updatedAt: past20Days
    }
  });

  // 7. Check trainer payout balance
  console.log("7. Trainer checks payout balance...");
  res = mockRes();
  await getPaymentSummary(trainerReq, res);
  if (res.statusCode !== 200) {
    throw new Error("Expected payout balance fetch to succeed");
  }
  // Available balance should only count earningCleared (60000 paise)
  if (res.body.data.availableBalancePaise !== 60000) {
    throw new Error(`Expected availableBalancePaise to be 60000, got ${res.body.data.availableBalancePaise}`);
  }

  // 8. Trainer creates payout request
  console.log("8. Trainer creates payout request...");
  trainerReq.body = { amountPaise: 60000 };
  res = mockRes();
  await createPayoutRequest(trainerReq, res);
  if (res.statusCode !== 201) {
    throw new Error("Expected payout request creation to succeed");
  }
  const payoutRequestId = res.body.data.id;

  // Verify balance lock
  res = mockRes();
  await getPaymentSummary(trainerReq, res);
  if (res.body.data.availableBalancePaise !== 0 || res.body.data.lockedAmountPaise !== 60000) {
    throw new Error("Expected balance to be locked immediately");
  }

  // 9. Admin approves request
  console.log("9. Admin approves request...");
  adminReq.params = { requestId: payoutRequestId };
  res = mockRes();
  await approveAdminTrainerPayoutRequest(adminReq, res);
  if (res.statusCode !== 200 || res.body.data.status !== "approved") {
    throw new Error("Expected admin approval to succeed");
  }

  // 10. Admin moves to processing
  console.log("10. Admin moves request to processing...");
  adminReq.body = { note: "Disbursing via bank portal" };
  res = mockRes();
  await processingAdminTrainerPayoutRequest(adminReq, res);
  if (res.statusCode !== 200 || res.body.data.status !== "processing") {
    throw new Error("Expected status transition to processing to succeed");
  }

  // 11. Admin marks request as paid
  console.log("11. Admin marks request as paid...");
  adminReq.body = {
    utrReference: "UTR9876543210",
    manualPaidDate: new Date(),
    note: "Transferred successfully"
  };
  res = mockRes();
  await paidAdminTrainerPayoutRequest(adminReq, res);
  if (res.statusCode !== 200 || res.body.data.status !== "paid") {
    throw new Error("Expected request status to be paid");
  }

  // Verify locks and earnings updated
  res = mockRes();
  await getPaymentSummary(trainerReq, res);
  if (res.body.data.lockedAmountPaise !== 0 || res.body.data.paidAmountPaise !== 60000) {
    throw new Error("Expected locked amount to be cleared and paid amount to be 60000");
  }

  const updatedEarning = await prisma.trainerEarning.findUnique({
    where: { id: earningCleared.id }
  });
  if (updatedEarning.status !== "paid") {
    throw new Error("Expected related earning to be marked paid");
  }

  // 12. Cleanup
  console.log("12. Cleaning up integration test data...");
  await prisma.trainerEarning.deleteMany({ where: { trainerId: testTrainer.id } });
  await prisma.liveSession.deleteMany({ where: { id: { in: [endedSession.id, activeSession.id] } } });
  await prisma.trainerPayoutRequestHistory.deleteMany({ where: { trainerId: testTrainer.id } });
  await prisma.trainerPayoutRequest.deleteMany({ where: { trainerId: testTrainer.id } });
  await prisma.trainerPayoutAccountHistory.deleteMany({ where: { trainerId: testTrainer.id } });
  await prisma.trainerPayoutAccount.deleteMany({ where: { trainerId: testTrainer.id } });
  await prisma.user.delete({ where: { id: testTrainer.id } });
  await prisma.user.delete({ where: { id: testAdmin.id } });

  console.log("\nAll Trainer Payout integration tests completed successfully! 🎉\n");
}

runTests().catch(err => {
  console.error("Integration test failed:", err);
  process.exit(1);
});
