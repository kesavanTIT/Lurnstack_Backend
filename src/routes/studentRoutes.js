const express = require("express");
const router = express.Router();
const {
  getAllLiveClasses,
  getLiveClassById,
  joinLiveClass,
  getStudentSessions,
  getStudentSessionDetails,
  addSessionCard,
  removeSessionCard,
  getMySessionCards,
  joinSession,
  getMyJoinedSessions,
  createBooking,
  verifyPayment,
  getStudentPayments,
  getStudentTITClasses,
  updatePushToken,
  getStudentNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} = require("../controllers/studentController");
const { protect } = require("../middleware/authMiddleware");

// Apply protection to all student routes
router.use(protect);

// @route   GET /api/student/live-classes
router.get("/live-classes", getAllLiveClasses);

// @route   GET /api/student/tit-classes
router.get("/tit-classes", getStudentTITClasses);

// @route   GET /api/student/live-class/:classId
router.get("/live-class/:classId", getLiveClassById);

// @route   POST /api/student/join-class/:classId
router.post("/join-class/:classId", joinLiveClass);

// ── NEW SESSION ENDPOINTS ──────────────────────

// @route   GET /api/student/sessions
router.get("/sessions", getStudentSessions);

// @route   GET /api/student/sessions/:sessionId
router.get("/sessions/:sessionId", getStudentSessionDetails);

// @route   POST /api/student/sessions/:sessionId/add-card
router.post("/sessions/:sessionId/add-card", addSessionCard);

// @route   DELETE /api/student/sessions/:sessionId/add-card
router.delete("/sessions/:sessionId/add-card", removeSessionCard);

// @route   GET /api/student/me/session-cards
router.get("/me/session-cards", getMySessionCards);

// @route   POST /api/student/sessions/:sessionId/join
router.post("/sessions/:sessionId/join", joinSession);

// @route   POST /api/student/sessions/:sessionId/heartbeat
router.post("/sessions/:sessionId/heartbeat", require("../controllers/studentController").heartbeatSession);

// @route   POST /api/student/sessions/:sessionId/leave
router.post("/sessions/:sessionId/leave", require("../controllers/studentController").leaveSession);

// @route   GET /api/student/attendance/history
router.get("/attendance/history", require("../controllers/studentController").getStudentAttendanceHistory);

// @route   GET /api/student/attendance
router.get("/attendance", require("../controllers/studentController").getStudentAttendance);

// @route   GET /api/student/courses/:courseId/attendance-eligibility
router.get("/courses/:courseId/attendance-eligibility", require("../controllers/studentController").getCourseAttendanceEligibility);

// @route   GET /api/student/courses/:courseId/attendance
router.get("/courses/:courseId/attendance", require("../controllers/studentController").getCourseAttendance);

// @route   GET /api/student/sessions/:sessionId/attendance
router.get("/sessions/:sessionId/attendance", require("../controllers/studentController").getSessionAttendance);

// @route   GET /api/student/me/session-bookings
router.get("/me/session-bookings", getMyJoinedSessions);

// @route   POST /api/student/sessions/:sessionId/bookings
router.post("/sessions/:sessionId/bookings", createBooking);

// @route   POST /api/student/payments/razorpay/verify
router.post("/payments/razorpay/verify", verifyPayment);

// @route   GET /api/student/payments
router.get("/payments", getStudentPayments);

// @route   PUT /api/student/push-token
router.put("/push-token", updatePushToken);

// @route   GET /api/student/notifications
router.get("/notifications", getStudentNotifications);

// @route   PATCH /api/student/notifications/:id/read
router.patch("/notifications/:id/read", markNotificationAsRead);

// @route   POST /api/student/notifications/read-all
router.post("/notifications/read-all", markAllNotificationsAsRead);

module.exports = router;
