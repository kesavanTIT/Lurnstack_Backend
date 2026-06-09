require("dotenv").config();
const prisma = require("../src/config/db");
const {
  getPaymentSummary,
  getPayoutBalance,
  getSessionEarnings,
  getSessionEarningDetail,
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
  console.log("Starting Trainer Payments API logical integration tests (Cycle-Free)...");

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
    await prisma.payment.deleteMany({ where: { studentId: testTrainer.id } });
    await prisma.booking.deleteMany({ where: { studentId: testTrainer.id } });
    await prisma.sessionPricing.deleteMany({ where: { session: { trainerId: testTrainer.id } } });
    await prisma.liveSession.deleteMany({ where: { trainerId: testTrainer.id } });
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
    if (res.statusCode !== 200 || res.body.data.status !== "missing") {
      throw new Error("Expected initial account status to be missing");
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
    req.body = {
      ifsc: "HDFC0005555",
      pan: "ABCDE1234F"
    };
    // Manually verify payout account details in DB
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

  // Earning 1: Pending Session Completion (not unpaid)
  const earningPending = await prisma.trainerEarning.create({
    data: {
      trainerId: testTrainer.id,
      sessionId: session.id,
      sessionDate: booking1.sessionDate,
      bookingId: booking1.id,
      paymentId: payment1.id,
      trainerName: "Payment Trainer",
      trainerEmail: "payment_trainer@lurnstack.com",
      sessionTitle: "Test Payment Session",
      paidStudentCount: 1,
      sessionPricePaise: 100000,
      grossRevenuePaise: 100000,
      trainerSharePercentage: 60.0,
      trainerEarningPaise: 60000,
      platformSharePercentage: 40.0,
      platformEarningPaise: 40000,
      finalPayablePaise: 60000,
      status: "pending_session_completion",
      availableAfter: new Date()
    }
  });

  // Earning 2: Unpaid (created now)
  const earningUncleared = await prisma.trainerEarning.create({
    data: {
      trainerId: testTrainer.id,
      sessionId: session.id,
      sessionDate: booking2.sessionDate,
      bookingId: booking2.id,
      paymentId: payment2.id,
      trainerName: "Payment Trainer",
      trainerEmail: "payment_trainer@lurnstack.com",
      sessionTitle: "Test Payment Session",
      paidStudentCount: 1,
      sessionPricePaise: 100000,
      grossRevenuePaise: 100000,
      trainerSharePercentage: 60.0,
      trainerEarningPaise: 60000,
      platformSharePercentage: 40.0,
      platformEarningPaise: 40000,
      finalPayablePaise: 60000,
      status: "unpaid",
      availableAfter: new Date(),
      createdAt: new Date()
    }
  });

  // Earning 3: Unpaid (created 20 days ago)
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 20);
  const earningCleared = await prisma.trainerEarning.create({
    data: {
      trainerId: testTrainer.id,
      sessionId: session.id,
      sessionDate: booking3.sessionDate,
      bookingId: booking3.id,
      paymentId: payment3.id,
      trainerName: "Payment Trainer",
      trainerEmail: "payment_trainer@lurnstack.com",
      sessionTitle: "Test Payment Session",
      paidStudentCount: 1,
      sessionPricePaise: 100000,
      grossRevenuePaise: 100000,
      trainerSharePercentage: 60.0,
      trainerEarningPaise: 60000,
      platformSharePercentage: 40.0,
      platformEarningPaise: 40000,
      finalPayablePaise: 60000,
      status: "unpaid",
      availableAfter: pastDate,
      createdAt: pastDate
    }
  });

  // Verify account details in DB
  await prisma.trainerPayoutAccount.update({
    where: { trainerId: testTrainer.id },
    data: { status: "verified" }
  });

  // 7b. Test GET Session Earnings (Grouped Structure - List API)
  {
    console.log("\n--- Test: GET Session Earnings (Grouped Structure - List API) ---");
    const res = mockRes();
    await getSessionEarnings(req, res);
    console.log("Status:", res.statusCode);
    console.log("Body sessions:", res.body.sessions);

    if (res.statusCode !== 200) {
      throw new Error("Expected session earnings query to succeed");
    }
    if (!res.body.sessions || res.body.sessions.length !== 1) {
      throw new Error(`Expected exactly 1 grouped session, got ${res.body.sessions?.length}`);
    }
    const sessionObj = res.body.sessions[0];
    if (sessionObj.sessionId !== session.id) {
      throw new Error(`Expected session ID ${session.id}, got ${sessionObj.sessionId}`);
    }
    if (sessionObj.earnings !== undefined) {
      throw new Error("Expected earnings array to be omitted in the List API response");
    }
    // Verify totals
    if (sessionObj.paidStudentCount !== 2) {
      throw new Error(`Expected 2 paid student bookings, got ${sessionObj.paidStudentCount}`);
    }
    if (sessionObj.grossRevenuePaise !== 300000) {
      throw new Error(`Expected grossRevenuePaise to be 300000, got ${sessionObj.grossRevenuePaise}`);
    }
    if (sessionObj.statusSummary.pending !== 2) {
      throw new Error(`Expected statusSummary pending to be 2, got ${sessionObj.statusSummary.pending}`);
    }
    // Verify legacy flat earnings array is present
    if (!res.body.earnings || res.body.earnings.length !== 3) {
      throw new Error(`Expected exactly 3 legacy flat earnings, got ${res.body.earnings?.length}`);
    }
  }

  // 7c. Test GET Session Earnings (Detail API)
  {
    console.log("\n--- Test: GET Session Earnings (Detail API) ---");
    const detailReq = {
      ...req,
      params: { sessionId: session.id }
    };
    const res = mockRes();
    await getSessionEarningDetail(detailReq, res);
    console.log("Status:", res.statusCode);
    console.log("Body session detail:", res.body.session);

    if (res.statusCode !== 200) {
      throw new Error("Expected session earnings detail query to succeed");
    }
    if (!res.body.session || res.body.session.sessionId !== session.id) {
      throw new Error("Expected session detail object matching sessionId");
    }
    if (res.body.session.earnings.length !== 3) {
      throw new Error(`Expected exactly 3 nested earnings in detail, got ${res.body.session.earnings.length}`);
    }
    if (res.body.session.paidStudentCount !== 2) {
      throw new Error(`Expected 2 paid student bookings in detail, got ${res.body.session.paidStudentCount}`);
    }
    if (res.body.session.trainerEarningPaise !== 180000) {
      throw new Error(`Expected trainerEarningPaise to be 180000 in detail, got ${res.body.session.trainerEarningPaise}`);
    }
  }

  // 8. Test GET Payment Summary (Cycle-Free)
  {
    console.log("\n--- Test: GET Payment Summary (Cycle-Free) ---");
    const res = mockRes();
    await getPaymentSummary(req, res);
    console.log("Status:", res.statusCode);
    console.log("Body:", res.body.data);
    // Both unpaid earnings (Earning 2 and Earning 3) should be cleared (60000 + 60000 = 120000 paise)
    if (res.body.data.availableBalancePaise !== 120000) {
      throw new Error(`Expected availableBalancePaise to be exactly 120000, got ${res.body.data.availableBalancePaise}`);
    }
    if (res.body.data.pendingEarningsPaise !== 0) {
      throw new Error(`Expected pendingEarningsPaise to be 0, got ${res.body.data.pendingEarningsPaise}`);
    }
  }

  // 8b. Test GET Payout Balance (Cycle-Free)
  {
    console.log("\n--- Test: GET Payout Balance (Cycle-Free) ---");
    const res = mockRes();
    await getPayoutBalance(req, res);
    console.log("Status:", res.statusCode);
    console.log("Body:", res.body.data);
    if (res.body.data.availableBalancePaise !== 120000) {
      throw new Error(`Expected availableBalancePaise to be exactly 120000, got ${res.body.data.availableBalancePaise}`);
    }
    if (res.body.data.pendingCycleEarningsPaise !== 0) {
      throw new Error(`Expected pendingCycleEarningsPaise to be 0, got ${res.body.data.pendingCycleEarningsPaise}`);
    }
    if (res.body.data.blockReason !== null) {
      throw new Error(`Expected blockReason to be null, got ${res.body.data.blockReason}`);
    }
    if (res.body.data.canRequest !== true) {
      throw new Error("Expected canRequest to be true");
    }
  }

  // 9. Test POST Create Payout Request (verified, amount too low)
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

  // 10. Test POST Create Payout Request (verified, insufficient balance)
  {
    console.log("\n--- Test: POST Create Payout Request (amount > available) ---");
    req.body = { amountPaise: 130000 };
    const res = mockRes();
    await createPayoutRequest(req, res);
    console.log("Status:", res.statusCode);
    console.log("Body:", res.body);
    if (res.statusCode !== 400 || res.body.success !== false) {
      throw new Error("Expected request exceeding available balance to be rejected");
    }
  }

  // 11. Test POST Create Payout Request (valid request)
  let payoutRequestId;
  {
    console.log("\n--- Test: POST Create Payout Request (valid) ---");
    req.body = { amountPaise: 120000 };
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

  // 12. Test GET Payment Summary (after requesting)
  {
    console.log("\n--- Test: GET Payment Summary (after request) ---");
    const res = mockRes();
    await getPaymentSummary(req, res);
    console.log("Status:", res.statusCode);
    console.log("Body:", res.body.data);
    if (res.body.data.availableBalancePaise !== 0) {
      throw new Error("Expected availableBalancePaise to drop to 0 after locking");
    }
    if (res.body.data.lockedAmountPaise !== 120000) {
      throw new Error("Expected lockedAmountPaise to be 120000");
    }
  }

  // 12b. Test GET Payment Summary (after payout request is marked paid partially)
  {
    console.log("\n--- Test: GET Payment Summary (after payout request is marked paid partially) ---");
    // Simulate admin marking the request as paid for 100000 paise instead of 120000 paise
    await prisma.trainerPayoutRequest.update({
      where: { id: payoutRequestId },
      data: {
        status: "paid",
        requestedAmountPaise: 100000
      }
    });

    // Also simulate that earnings are marked as paid
    await prisma.trainerEarning.updateMany({
      where: { payoutRequestId },
      data: { status: "paid" }
    });

    const res = mockRes();
    await getPaymentSummary(req, res);
    console.log("Status:", res.statusCode);
    console.log("Body:", res.body.data);

    if (res.body.data.availableBalancePaise !== 20000) {
      throw new Error(`Expected availableBalancePaise to be 20000, got ${res.body.data.availableBalancePaise}`);
    }
    if (res.body.data.isPayoutWindowOpen !== false) {
      throw new Error("Expected isPayoutWindowOpen to be false");
    }
    if (res.body.data.payoutBlockReason !== "INSUFFICIENT_BALANCE") {
      throw new Error(`Expected payoutBlockReason to be INSUFFICIENT_BALANCE, got ${res.body.data.payoutBlockReason}`);
    }
  }

  // 13. Clean up
  console.log("\nCleaning up test data...");
  await prisma.trainerEarning.deleteMany({ where: { trainerId: testTrainer.id } });
  await prisma.booking.deleteMany({
    where: { id: { in: [booking1.id, booking2.id, booking3.id] } }
  });
  await prisma.payment.deleteMany({
    where: { id: { in: [payment1.id, payment2.id, payment3.id] } }
  });
  await prisma.sessionPricing.deleteMany({ where: { session: { trainerId: testTrainer.id } } });
  await prisma.liveSession.deleteMany({ where: { trainerId: testTrainer.id } });
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
