const express = require("express");
const router = express.Router();
const {
  getDashboardSummary,
  getStudents,
  getTrainers,
  deleteStudent,
  deleteAllStudents,
  deleteTrainer,
  toggleTrainerStatus,
  createLiveClass,
  updateLiveClass,
  deleteLiveClass,
  testSessionReminderWhatsapp,
  testWhatsappReminderManual,
} = require("../controllers/adminController");
const {
  registerAdmin,
  loginAdmin,
  getAdminMe,
  logoutAdmin,
} = require("../controllers/adminAuthController");
const {
  getAdminSessionById,
  getAdminPayments,
  getAdminPaymentById,
  getSessionRevenue,
  refundPayment,
  updatePaymentSettings,
} = require("../controllers/adminPaymentController");

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
} = require("../controllers/adminPayoutController");
const {
  reviewAndPublishSession,
  getPendingReviewSessions,
} = require("../controllers/sessionReminderController");
const {
  getAttendanceOverview,
  getAllAttendanceRecords,
  getTrainerAttendanceAdmin,
  getAllCoursesAttendance,
  getCourseAttendanceSummaryAdmin,
  getSessionAttendanceAdmin,
  getStudentAttendanceAdmin,
  updateAttendanceRecord
} = require("../controllers/adminAttendanceController");

const { protect, isAdmin } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

// ── Public Admin Routes ───────────────────────
router.post("/register", registerAdmin);
router.post("/login", loginAdmin);
router.post("/logout", logoutAdmin);

// ── Protected Admin Routes ────────────────────
// Apply protect and isAdmin to all routes below
router.use(protect);
router.use(isAdmin);

router.get("/me", getAdminMe);
router.get("/dashboard/summary", getDashboardSummary);
router.get("/students", getStudents);
router.get("/trainers", getTrainers);
router.delete("/students", deleteAllStudents);
router.delete("/students/:id", deleteStudent);
router.delete("/trainers/:id", deleteTrainer);
router.patch("/trainers/:id", toggleTrainerStatus);
router.put("/trainers/:id", toggleTrainerStatus);
router.patch("/trainers/:id/status", toggleTrainerStatus);

// Live Class Management
router.post("/create-live-class", upload.single("thumbnail"), createLiveClass);
router.put("/update-live-class/:classId", upload.single("thumbnail"), updateLiveClass);
router.delete("/delete-live-class/:classId", deleteLiveClass);

// ── Admin Payments & Pricing Management ───────────
router.get("/sessions", getAdminSessionsPricingRef);
// NOTE: Specific sub-routes MUST be declared before the generic /:sessionId route
// to prevent Express from matching "revenue" as a sessionId value.
router.get("/sessions/pending-review", getPendingReviewSessions);
router.get("/sessions/:sessionId/revenue", getSessionRevenue);
router.get("/sessions/:sessionId", getAdminSessionById);
router.patch("/sessions/:sessionId/pricing", updateAdminSessionPricing);
// ── Admin Session Review & Publish ────────────────
// PUT /api/admin/sessions/:sessionId/review  → Admin sets price + publishes session
router.put("/sessions/:sessionId/review", reviewAndPublishSession);
router.get("/payments", getAdminPayments);
router.get("/payments/:paymentId", getAdminPaymentById);
router.post("/payments/:paymentId/refund", refundPayment);
router.patch("/payment-settings", updatePaymentSettings);

// ── Admin Trainer Earnings Endpoints ────────────────
router.get("/trainer-earnings", getAdminTrainerEarnings);
router.get("/trainer-earnings/:earningId", getAdminTrainerEarningById);

// ── Admin Trainer Payout Accounts Endpoints ──────────
router.get("/trainer-payout-accounts", getAdminTrainerPayoutAccounts);
router.get("/trainer-payout-accounts/:accountId", getAdminTrainerPayoutAccountById);
router.patch("/trainer-payout-accounts/:accountId/verify", verifyAdminTrainerPayoutAccount);
router.patch("/trainer-payout-accounts/:accountId/reject", rejectAdminTrainerPayoutAccount);
router.get("/trainer-payout-accounts/:accountId/history", getAdminTrainerPayoutAccountHistory);

// ── Admin Trainer Payout Requests Endpoints ──────────
router.get("/trainer-payout-requests", getAdminTrainerPayoutRequests);
router.get("/trainer-payout-requests/:requestId", getAdminTrainerPayoutRequestById);
router.patch("/trainer-payout-requests/:requestId/approve", approveAdminTrainerPayoutRequest);
router.patch("/trainer-payout-requests/:requestId/reject", rejectAdminTrainerPayoutRequest);
router.patch("/trainer-payout-requests/:requestId/processing", processingAdminTrainerPayoutRequest);
router.patch("/trainer-payout-requests/:requestId/paid", paidAdminTrainerPayoutRequest);
router.get("/trainer-payout-requests/:requestId/history", getAdminTrainerPayoutRequestHistory);

// ── Admin Attendance Endpoints ────────────────────
router.get("/attendance", getAllAttendanceRecords);
router.get("/attendance/overview", getAttendanceOverview);
router.get("/attendance/courses", getAllCoursesAttendance);
router.get("/courses/:courseId/attendance-summary", getCourseAttendanceSummaryAdmin);
router.get("/sessions/:sessionId/attendance", getSessionAttendanceAdmin);
router.get("/trainers/:trainerId/attendance", getTrainerAttendanceAdmin);
router.get("/students/:studentId/attendance", getStudentAttendanceAdmin);
router.patch("/attendance/:attendanceId", updateAttendanceRecord);

// ── Admin WhatsApp Endpoints ──────────────────────
router.post("/whatsapp/test-session-reminder", testSessionReminderWhatsapp);
router.post("/test-whatsapp-reminder", testWhatsappReminderManual);

module.exports = router;
