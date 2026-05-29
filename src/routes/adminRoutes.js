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
} = require("../controllers/adminController");
const {
  registerAdmin,
  loginAdmin,
  getAdminMe,
} = require("../controllers/adminAuthController");
const {
  getAdminSessions,
  getAdminSessionById,
  updateSessionPricing,
  getAdminPayments,
  getAdminPaymentById,
  getSessionRevenue,
  getAdminTrainerEarnings,
  markTrainerEarningPaid,
  toggleTrainerEarningHold,
  refundPayment,
  updatePaymentSettings,
} = require("../controllers/adminPaymentController");
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
router.get("/sessions", getAdminSessions);
// NOTE: Specific sub-routes MUST be declared before the generic /:sessionId route
// to prevent Express from matching "revenue" as a sessionId value.
router.get("/sessions/pending-review", getPendingReviewSessions);
router.get("/sessions/:sessionId/revenue", getSessionRevenue);
router.get("/sessions/:sessionId", getAdminSessionById);
router.patch("/sessions/:sessionId/pricing", updateSessionPricing);
// ── Admin Session Review & Publish ────────────────
// PUT /api/admin/sessions/:sessionId/review  → Admin sets price + publishes session
router.put("/sessions/:sessionId/review", reviewAndPublishSession);
router.get("/payments", getAdminPayments);
router.get("/payments/:paymentId", getAdminPaymentById);
router.get("/trainer-earnings", getAdminTrainerEarnings);
router.post("/trainer-earnings/:earningId/mark-paid", markTrainerEarningPaid);
router.post("/trainer-earnings/:earningId/hold", toggleTrainerEarningHold);
router.post("/payments/:paymentId/refund", refundPayment);
router.patch("/payment-settings", updatePaymentSettings);

// ── Admin Attendance Endpoints ────────────────────
router.get("/attendance", getAllAttendanceRecords);
router.get("/attendance/overview", getAttendanceOverview);
router.get("/attendance/courses", getAllCoursesAttendance);
router.get("/courses/:courseId/attendance-summary", getCourseAttendanceSummaryAdmin);
router.get("/sessions/:sessionId/attendance", getSessionAttendanceAdmin);
router.get("/trainers/:trainerId/attendance", getTrainerAttendanceAdmin);
router.get("/students/:studentId/attendance", getStudentAttendanceAdmin);
router.patch("/attendance/:attendanceId", updateAttendanceRecord);

module.exports = router;
