require("dotenv").config();
const prisma = require("../src/config/db");
const {
  getPaymentSummary,
  getSessionEarnings,
  getPayoutAccount,
  createPayoutAccount,
  updatePayoutAccount,
  createPayoutRequest,
  getPayoutRequests,
  getPayoutRequestById
} = require("../src/controllers/trainerPaymentController");

// Helper mock response
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
  console.log("Starting Trainer Payments API logical integration tests...");

  // 1. Setup Test Trainer User
  let testTrainer = await prisma.user.findFirst({
    where: { email: "payment_trainer@lurnstack.com" }
  });

  if (!testTrainer) {
    testTrainer = await prisma.user.create({
      data: {
        fullName: "Payment Trainer",
        email: "payment_trainer@lurnstack.com",
        password: "securepassword",
        role: "TRAINER",
        isActive: true
      }
    });
  } else {
    // Clear any existing test data associated with this trainer
    await prisma.trainerEarning.deleteMany({ where: { trainerId: testTrainer.id } });
    await prisma.trainerPayoutRequest.deleteMany({ where: { trainerId: testTrainer.id } });
    await prisma.trainerPayoutAccount.deleteMany({ where: { trainerId: testTrainer.id } });
  }

  const req = {
    user: {
      id: testTrainer.id,
      role: "trainer"
    },
    query: {},
    body: {},
    params: {}
  };

  // 2. Test GET Payout Account (should be empty first)
  {
    console.log("\n--- Test: GET Payout Account (initial state) ---");
    const res = mockRes();
    await getPayoutAccount(req, res);
    console.log("Status:", res.statusCode);
    console.log("Body:", res.body);
    if (res.statusCode !== 200 || res.body.data !== null) {
      throw new Error("Expected initial account to be null");
    }
  }

  // 3. Test GET Payment Summary (should be zeroed)
  {
    console.log("\n--- Test: GET Payment Summary (initial state) ---");
    const res = mockRes();
    await getPaymentSummary(req, res);
    console.log("Status:", res.statusCode);
    console.log("Body:", res.body);
    if (res.statusCode !== 200 || res.body.data.availableBalancePaise !== 0) {
      throw new Error("Expected initial availableBalancePaise to be 0");
    }
    if (res.body.data.payoutAccountStatus !== "missing") {
      throw new Error("Expected payoutAccountStatus to be 'missing'");
    }
  }

  // 4. Test POST Create Payout Account
  {
    console.log("\n--- Test: POST Create Payout Account ---");
    req.body = {
      accountHolderName: "Payment Trainer",
      bankName: "HDFC Bank",
      accountNumber: "123456789012",
      confirmAccountNumber: "123456789012",
      ifsc: "HDFC0001234",
      phoneNumber: "9876543210"
    };
    const res = mockRes();
    await createPayoutAccount(req, res);
    console.log("Status:", res.statusCode);
    console.log("Body:", res.body);
    if (res.statusCode !== 201) {
      throw new Error("Expected account creation to succeed with 201");
    }
    if (res.body.data.maskedAccountNumber !== "********9012") {
      throw new Error("Expected account number to be masked correctly");
    }
    if (res.body.data.status !== "pending") {
      throw new Error("Expected initial status to be pending");
    }
  }

  // 5. Test POST Create Payout Account (duplicate reject)
  {
    console.log("\n--- Test: POST Create Payout Account (duplicate) ---");
    const res = mockRes();
    await createPayoutAccount(req, res);
    console.log("Status:", res.statusCode);
    console.log("Body:", res.body);
    if (res.statusCode !== 400 || res.body.success !== false) {
      throw new Error("Expected duplicate account creation to fail with 400");
    }
  }

  // 6. Test PATCH Update Payout Account
  {
    console.log("\n--- Test: PATCH Update Payout Account ---");
    // Change PAN and IFSC, should reset status to pending
    req.body = {
      ifsc: "HDFC0005555",
      pan: "ABCDE1234F"
    };
    // Let's first manually set status to verified in DB to test the reset
    await prisma.trainerPayoutAccount.update({
      where: { trainerId: testTrainer.id },
      data: { status: "verified" }
    });

    const res = mockRes();
    await updatePayoutAccount(req, res);
    console.log("Status:", res.statusCode);
    console.log("Body:", res.body);
    if (res.statusCode !== 200 || res.body.data.status !== "pending") {
      throw new Error("Expected PATCH update to reset status to pending");
    }
    if (res.body.data.ifsc !== "HDFC0005555" || res.body.data.pan !== "ABCDE1234F") {
      throw new Error("Expected fields to be updated correctly");
    }
  }

  // 7. Setup Mock Live Sessions and Earnings
  console.log("\n--- Setting up Mock Live Sessions and Earnings ---");
  const session = await prisma.liveSession.create({
    data: {
      trainerId: testTrainer.id,
      title: "Test Payment Session",
      priceInPaise: 100000,
      pricingState: "PRICED",
      publishState: "PUBLISHED"
    }
  });

  const sessionPricing = await prisma.sessionPricing.create({
    data: {
      sessionId: session.id,
      amountPaise: 100000,
      trainerSharePercent: 60.0,
      platformCommissionPercent: 40.0,
      createdByAdminId: testTrainer.id
    }
  });

  const booking1 = await prisma.booking.create({
    data: {
      studentId: testTrainer.id,
      sessionId: session.id,
      sessionDate: new Date(),
      amountPaise: 100000
    }
  });

  const booking2 = await prisma.booking.create({
    data: {
      studentId: testTrainer.id,
      sessionId: session.id,
      sessionDate: new Date(),
      amountPaise: 100000
    }
  });

  const booking3 = await prisma.booking.create({
    data: {
      studentId: testTrainer.id,
      sessionId: session.id,
      sessionDate: new Date(),
      amountPaise: 100000
    }
  });

  const payment1 = await prisma.payment.create({
    data: {
      bookingId: booking1.id,
      studentId: testTrainer.id,
      sessionId: session.id,
      razorpayOrderId: "order_mock_1",
      razorpayPaymentId: "pay_mock_1",
      amountPaise: 100000,
      status: "captured"
    }
  });

  const payment2 = await prisma.payment.create({
    data: {
      bookingId: booking2.id,
      studentId: testTrainer.id,
      sessionId: session.id,
      razorpayOrderId: "order_mock_2",
      razorpayPaymentId: "pay_mock_2",
      amountPaise: 100000,
      status: "captured"
    }
  });

  const payment3 = await prisma.payment.create({
    data: {
      bookingId: booking3.id,
      studentId: testTrainer.id,
      sessionId: session.id,
      razorpayOrderId: "order_mock_3",
      razorpayPaymentId: "pay_mock_3",
      amountPaise: 100000,
      status: "captured"
    }
  });

  // Earning 1: Pending Session Completion
  const earningPending = await prisma.trainerEarning.create({
    data: {
      trainerId: testTrainer.id,
      sessionId: session.id,
      sessionDate: booking1.sessionDate,
      bookingId: booking1.id,
      paymentId: payment1.id,
      grossAmountPaise: 100000,
      platformFeePaise: 40000,
      trainerAmountPaise: 60000,
      status: "pending_session_completion",
      availableAfter: new Date()
    }
  });

  // Earning 2: Payable but Uncleared (created now, in current cycle)
  const earningUncleared = await prisma.trainerEarning.create({
    data: {
      trainerId: testTrainer.id,
      sessionId: session.id,
      sessionDate: booking2.sessionDate,
      bookingId: booking2.id,
      paymentId: payment2.id,
      grossAmountPaise: 100000,
      platformFeePaise: 40000,
      trainerAmountPaise: 60000,
      status: "payable",
      availableAfter: new Date(),
      createdAt: new Date()
    }
  });

  // Earning 3: Payable and Cleared (created 20 days ago)
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 20);
  const earningCleared = await prisma.trainerEarning.create({
    data: {
      trainerId: testTrainer.id,
      sessionId: session.id,
      sessionDate: booking3.sessionDate,
      bookingId: booking3.id,
      paymentId: payment3.id,
      grossAmountPaise: 100000,
      platformFeePaise: 40000,
      trainerAmountPaise: 60000,
      status: "payable",
      availableAfter: pastDate,
      createdAt: pastDate
    }
  });

  // 8. Test GET Payment Summary (with earnings, account pending)
  {
    console.log("\n--- Test: GET Payment Summary (with earnings, account pending) ---");
    const res = mockRes();
    await getPaymentSummary(req, res);
    console.log("Status:", res.statusCode);
    console.log("Body:", res.body.data);
    if (res.body.data.availableBalancePaise !== 60000) {
      throw new Error("Expected availableBalancePaise to be exactly 60000 (from cleared earning)");
    }
    if (res.body.data.pendingEarningsPaise !== 120000) {
      // 60000 pending + 60000 uncleared = 120000
      throw new Error(`Expected pendingEarningsPaise to be 120000, got ${res.body.data.pendingEarningsPaise}`);
    }
    if (res.body.data.isPayoutWindowOpen !== false || res.body.data.payoutBlockReason !== "ACCOUNT_PENDING_VERIFICATION") {
      throw new Error("Expected payout to be blocked because account is pending verification");
    }
  }

  // 9. Test POST Create Payout Request (unverified account)
  {
    console.log("\n--- Test: POST Create Payout Request (unverified account) ---");
    req.body = { amountPaise: 60000 };
    const res = mockRes();
    await createPayoutRequest(req, res);
    console.log("Status:", res.statusCode);
    console.log("Body:", res.body);
    if (res.statusCode !== 400 || res.body.success !== false) {
      throw new Error("Expected request to fail with unverified account");
    }
  }

  // Verify account in DB
  await prisma.trainerPayoutAccount.update({
    where: { trainerId: testTrainer.id },
    data: { status: "verified" }
  });

  // 10. Test POST Create Payout Request (verified, amount too low)
  {
    console.log("\n--- Test: POST Create Payout Request (amount < 50000) ---");
    req.body = { amountPaise: 40000 };
    const res = mockRes();
    await createPayoutRequest(req, res);
    console.log("Status:", res.statusCode);
    console.log("Body:", res.body);
    if (res.statusCode !== 400 || res.body.success !== false) {
      throw new Error("Expected amount < 50000 to be rejected");
    }
  }

  // 11. Test POST Create Payout Request (verified, insufficient balance)
  {
    console.log("\n--- Test: POST Create Payout Request (amount > available) ---");
    req.body = { amountPaise: 70000 };
    const res = mockRes();
    await createPayoutRequest(req, res);
    console.log("Status:", res.statusCode);
    console.log("Body:", res.body);
    if (res.statusCode !== 400 || res.body.success !== false) {
      throw new Error("Expected request exceeding available balance to be rejected");
    }
  }

  // 12. Test POST Create Payout Request (valid request)
  let payoutRequestId;
  {
    console.log("\n--- Test: POST Create Payout Request (valid) ---");
    req.body = { amountPaise: 60000 };
    const res = mockRes();
    await createPayoutRequest(req, res);
    console.log("Status:", res.statusCode);
    console.log("Body:", res.body);
    if (res.statusCode !== 201 || !res.body.data.id) {
      throw new Error("Expected valid payout request to be created");
    }
    payoutRequestId = res.body.data.id;
    if (res.body.data.status !== "requested") {
      throw new Error("Expected request status to be requested");
    }
  }

  // 13. Test GET Payment Summary (after requesting)
  {
    console.log("\n--- Test: GET Payment Summary (after request) ---");
    const res = mockRes();
    await getPaymentSummary(req, res);
    console.log("Status:", res.statusCode);
    console.log("Body:", res.body.data);
    if (res.body.data.availableBalancePaise !== 0) {
      throw new Error("Expected availableBalancePaise to drop to 0 after locking");
    }
    if (res.body.data.lockedAmountPaise !== 60000) {
      throw new Error("Expected lockedAmountPaise to be 60000");
    }
    if (res.body.data.requestedAmountPaise !== 60000) {
      throw new Error("Expected requestedAmountPaise to be 60000");
    }
    if (res.body.data.hasActiveRequest !== true || res.body.data.payoutBlockReason !== "ACTIVE_REQUEST_EXISTS") {
      throw new Error("Expected active request block reason");
    }
  }

  // 14. Test PATCH Payout Account (should reject while active request exists)
  {
    console.log("\n--- Test: PATCH Payout Account (should fail with active request) ---");
    req.body = { bankName: "ICICI Bank" };
    const res = mockRes();
    await updatePayoutAccount(req, res);
    console.log("Status:", res.statusCode);
    console.log("Body:", res.body);
    if (res.statusCode !== 400 || res.body.success !== false) {
      throw new Error("Expected payout account update to be rejected while request is active");
    }
  }

  // 15. Test GET Session Earnings (verify dynamic status mapping)
  {
    console.log("\n--- Test: GET Session Earnings (pagination and status filters) ---");
    req.query = { status: "requested" };
    const res = mockRes();
    await getSessionEarnings(req, res);
    console.log("Status:", res.statusCode);
    console.log("Body Data Count:", res.body.data.length);
    console.log("Earning Item:", res.body.data[0]);
    if (res.statusCode !== 200 || res.body.data.length !== 1) {
      throw new Error("Expected exactly 1 earning with status requested");
    }
    if (res.body.data[0].status !== "requested") {
      throw new Error("Expected earning status to map dynamically to requested");
    }
    
    // Clear filters
    req.query = {};
  }

  // 16. Test GET Payout Request by ID
  {
    console.log("\n--- Test: GET Payout Request by ID ---");
    req.params = { requestId: payoutRequestId };
    const res = mockRes();
    await getPayoutRequestById(req, res);
    console.log("Status:", res.statusCode);
    console.log("Body:", res.body.data);
    if (res.statusCode !== 200 || res.body.data.id !== payoutRequestId) {
      throw new Error("Expected to fetch payout request successfully");
    }
    if (res.body.data.payoutAccountSnapshot.bankName !== "HDFC Bank") {
      throw new Error("Expected payout snapshot to match HDFC Bank");
    }
  }

  // 17. Clean up
  console.log("\nCleaning up test data...");
  await prisma.trainerEarning.deleteMany({ where: { trainerId: testTrainer.id } });
  await prisma.booking.deleteMany({
    where: { id: { in: [booking1.id, booking2.id, booking3.id] } }
  });
  await prisma.payment.deleteMany({
    where: { id: { in: [payment1.id, payment2.id, payment3.id] } }
  });
  await prisma.sessionPricing.deleteMany({ where: { sessionId: session.id } });
  await prisma.liveSession.deleteMany({ where: { id: session.id } });
  await prisma.trainerPayoutRequest.deleteMany({ where: { trainerId: testTrainer.id } });
  await prisma.trainerPayoutAccount.deleteMany({ where: { trainerId: testTrainer.id } });
  await prisma.user.delete({ where: { id: testTrainer.id } });

  console.log("\nAll unit and integration tests completed successfully! 🎉");
}

runTests()
  .catch(err => {
    console.error("Test execution failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
