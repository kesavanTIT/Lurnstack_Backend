require("dotenv").config();
const prisma = require("../src/config/db");
const jwt = require("jsonwebtoken");
const axios = require("axios");

process.env.PORT = 5888;
const app = require("../src/server");

async function runTest() {
  console.log("=== STARTING GROUPED TRAINER EARNINGS TEST ===");

  // Find or create admin
  let admin = await prisma.user.findFirst({
    where: { role: "ADMIN" }
  });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        fullName: "Test Admin User",
        email: "test_admin_earnings@lurnstack.com",
        password: "password123",
        role: "ADMIN",
        isActive: true
      }
    });
  }

  // Find or create trainer
  let trainer = await prisma.user.findFirst({
    where: { email: "test_trainer_earnings@lurnstack.com" }
  });
  if (!trainer) {
    trainer = await prisma.user.create({
      data: {
        fullName: "Test Trainer Earnings",
        email: "test_trainer_earnings@lurnstack.com",
        password: "password123",
        role: "TRAINER",
        isActive: true
      }
    });
  }

  // Find or create student
  let student = await prisma.user.findFirst({
    where: { email: "test_student_earnings@lurnstack.com" }
  });
  if (!student) {
    student = await prisma.user.create({
      data: {
        fullName: "Test Student Earnings",
        email: "test_student_earnings@lurnstack.com",
        password: "password123",
        role: "STUDENT",
        isActive: true
      }
    });
  }

  // Find or create LiveSession
  let session = await prisma.liveSession.findFirst({
    where: { title: "Grouped Earnings Test Live Session" }
  });
  if (!session) {
    session = await prisma.liveSession.create({
      data: {
        title: "Grouped Earnings Test Live Session",
        trainerId: trainer.id,
        pricingState: "PRICED",
        priceInPaise: 100000,
        trainerSharePercentage: 60.0,
        platformCommissionPercentage: 40.0
      }
    });
  }

  // Find or create Booking & Payment
  let booking = await prisma.booking.findFirst({
    where: { sessionId: session.id, studentId: student.id }
  });
  if (!booking) {
    booking = await prisma.booking.create({
      data: {
        studentId: student.id,
        sessionId: session.id,
        sessionDate: new Date(),
        amountPaise: 100000,
        status: "paid"
      }
    });
  }

  let payment = await prisma.payment.findFirst({
    where: { bookingId: booking.id }
  });
  if (!payment) {
    payment = await prisma.payment.create({
      data: {
        bookingId: booking.id,
        studentId: student.id,
        sessionId: session.id,
        razorpayOrderId: "order_test_grouped_1",
        razorpayPaymentId: "pay_test_grouped_1",
        amountPaise: 100000,
        status: "captured",
        paidAt: new Date()
      }
    });
  }

  // Create Payout Request
  let payoutRequest = await prisma.trainerPayoutRequest.create({
    data: {
      trainerId: trainer.id,
      trainerName: trainer.fullName,
      requestedAmountPaise: 60000,
      availableBalanceAtRequestPaise: 120000,
      lockedAmountPaise: 60000,
      status: "approved",
      payoutAccountSnapshot: {}
    }
  });

  // Create Payout Request History
  let payoutHistory = await prisma.trainerPayoutRequestHistory.create({
    data: {
      payoutRequestId: payoutRequest.id,
      trainerId: trainer.id,
      action: "requested",
      oldStatus: "none",
      newStatus: "requested",
      note: "Trainer requested payout",
      createdAt: new Date(Date.now() - 3600000)
    }
  });

  let payoutHistory2 = await prisma.trainerPayoutRequestHistory.create({
    data: {
      payoutRequestId: payoutRequest.id,
      trainerId: trainer.id,
      action: "approved",
      oldStatus: "requested",
      newStatus: "approved",
      adminName: admin.fullName,
      note: "Payout approved by admin",
      createdAt: new Date()
    }
  });

  // Create two TrainerEarning rows for the same session (simulating two student payments or a split payout)
  let earning1 = await prisma.trainerEarning.create({
    data: {
      trainerId: trainer.id,
      trainerName: trainer.fullName,
      trainerEmail: trainer.email,
      sessionId: session.id,
      sessionTitle: session.title,
      paidStudentCount: 1,
      sessionPricePaise: 100000,
      grossRevenuePaise: 100000,
      trainerSharePercentage: 60.0,
      trainerEarningPaise: 60000,
      platformSharePercentage: 40.0,
      platformEarningPaise: 40000,
      refundAdjustmentPaise: 0,
      finalPayablePaise: 60000,
      status: "approved",
      payoutRequestId: payoutRequest.id,
      bookingId: booking.id,
      paymentId: payment.id,
      createdAt: new Date(Date.now() - 7200000),
      updatedAt: new Date()
    }
  });

  let earning2 = await prisma.trainerEarning.create({
    data: {
      trainerId: trainer.id,
      trainerName: trainer.fullName,
      trainerEmail: trainer.email,
      sessionId: session.id,
      sessionTitle: session.title,
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
      bookingId: booking.id,
      paymentId: payment.id,
      createdAt: new Date(Date.now() - 3600000),
      updatedAt: new Date()
    }
  });

  // Sign Admin token
  const token = jwt.sign(
    { id: admin.id, role: "ADMIN" },
    process.env.JWT_SECRET
  );

  const client = axios.create({
    baseURL: "http://localhost:5888",
    headers: {
      Authorization: `Bearer ${token}`
    },
    validateStatus: () => true
  });

  console.log("\n--- TEST 1: Get trainer earnings without groupBy (Default flow) ---");
  const resDefault = await client.get(`/api/admin/trainer-earnings?trainerId=${trainer.id}`);
  console.log("Status:", resDefault.status);
  if (resDefault.status !== 200) {
    throw new Error(`Default trainer-earnings API returned status ${resDefault.status}`);
  }
  const defaultData = resDefault.data.data;
  console.log(`Returned ${defaultData.length} flat rows (expected: at least 2)`);
  if (defaultData.length < 2) {
    throw new Error(`Expected at least 2 earning rows in default response, got ${defaultData.length}`);
  }
  // Verify that it is flat row format (checking if id exists and groupBy session elements like earningRows do not exist)
  if (!defaultData[0].id || defaultData[0].earningRows !== undefined) {
    throw new Error("Default response shape is not flat!");
  }

  console.log("\n--- TEST 2: Get trainer earnings with groupBy=session ---");
  const resGrouped = await client.get(`/api/admin/trainer-earnings?trainerId=${trainer.id}&groupBy=session`);
  console.log("Status:", resGrouped.status);
  if (resGrouped.status !== 200) {
    throw new Error(`Grouped trainer-earnings API returned status ${resGrouped.status}`);
  }
  
  const groupedData = resGrouped.data.data;
  console.log(`Returned ${groupedData.length} grouped sessions (expected: 1)`);
  if (groupedData.length !== 1) {
    throw new Error(`Expected exactly 1 grouped session, got ${groupedData.length}`);
  }

  const sessionObj = groupedData[0];
  console.log("Grouped Session Data structure:");
  console.log(JSON.stringify(sessionObj, null, 2));

  // Asserting expected values
  if (sessionObj.sessionId !== session.id) {
    throw new Error(`Expected sessionId to be ${session.id}, got ${sessionObj.sessionId}`);
  }
  if (sessionObj.sessionTitle !== session.title) {
    throw new Error(`Expected sessionTitle to be "${session.title}", got "${sessionObj.sessionTitle}"`);
  }
  if (sessionObj.paidStudentCount !== 2) {
    throw new Error(`Expected paidStudentCount to be 2, got ${sessionObj.paidStudentCount}`);
  }
  if (sessionObj.grossRevenuePaise !== 200000) {
    throw new Error(`Expected grossRevenuePaise to be 200000, got ${sessionObj.grossRevenuePaise}`);
  }
  if (sessionObj.trainerEarningPaise !== 120000) {
    throw new Error(`Expected trainerEarningPaise to be 120000, got ${sessionObj.trainerEarningPaise}`);
  }
  if (sessionObj.platformCommissionPercentage !== 40.0) {
    throw new Error(`Expected platformCommissionPercentage to be 40, got ${sessionObj.platformCommissionPercentage}`);
  }
  if (sessionObj.payoutStatus !== "approved") {
    // "approved" takes priority over "unpaid"
    throw new Error(`Expected payoutStatus to be "approved" based on priority processing > approved > requested > unpaid, got "${sessionObj.payoutStatus}"`);
  }

  // Asserting earningRows
  console.log(`\nEarning Rows count: ${sessionObj.earningRows.length} (expected: 2)`);
  if (sessionObj.earningRows.length !== 2) {
    throw new Error(`Expected 2 earningRows, got ${sessionObj.earningRows.length}`);
  }
  const row = sessionObj.earningRows[0];
  if (!row.id || !row.studentId || !row.studentName || row.amountPaidPaise !== 100000) {
    throw new Error("earningRows does not contain expected student details/amounts");
  }

  // Asserting history
  console.log(`History length: ${sessionObj.history.length} (expected: 4)`);
  // Expecting:
  // - 2 earning_created events
  // - 2 payout_request events (requested, approved)
  if (sessionObj.history.length !== 4) {
    throw new Error(`Expected 4 history items, got ${sessionObj.history.length}`);
  }
  const earningCreatedHistory = sessionObj.history.filter(h => h.type === "earning_created");
  if (earningCreatedHistory.length !== 2) {
    throw new Error(`Expected 2 earning_created history entries, got ${earningCreatedHistory.length}`);
  }
  const requestedHistory = sessionObj.history.find(h => h.type === "payout_requested");
  if (!requestedHistory || requestedHistory.amountPaise !== 60000) {
    throw new Error(`Expected payout_requested event with amountPaise=60000, got ${JSON.stringify(requestedHistory)}`);
  }
  const approvedHistory = sessionObj.history.find(h => h.type === "payout_approved");
  if (!approvedHistory || approvedHistory.adminName !== admin.fullName) {
    throw new Error(`Expected payout_approved event with adminName="${admin.fullName}", got ${JSON.stringify(approvedHistory)}`);
  }

  console.log("\nCleaning up test data...");
  await prisma.trainerEarning.delete({ where: { id: earning1.id } });
  await prisma.trainerEarning.delete({ where: { id: earning2.id } });
  await prisma.trainerPayoutRequestHistory.deleteMany({ where: { payoutRequestId: payoutRequest.id } });
  await prisma.trainerPayoutRequest.delete({ where: { id: payoutRequest.id } });
  await prisma.payment.delete({ where: { id: payment.id } });
  await prisma.booking.delete({ where: { id: booking.id } });
  await prisma.liveSession.delete({ where: { id: session.id } });
  if (admin.email === "test_admin_earnings@lurnstack.com") {
    await prisma.user.delete({ where: { id: admin.id } });
  }
  if (trainer.email === "test_trainer_earnings@lurnstack.com") {
    await prisma.user.delete({ where: { id: trainer.id } });
  }
  if (student.email === "test_student_earnings@lurnstack.com") {
    await prisma.user.delete({ where: { id: student.id } });
  }

  console.log("\n=== ALL TESTS PASSED SUCCESSFULLY! ===");
  process.exit(0);
}

setTimeout(() => {
  runTest().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
  });
}, 2000);
