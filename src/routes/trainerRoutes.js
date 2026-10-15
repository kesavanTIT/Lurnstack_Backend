const express = require("express");
const router = express.Router();

const {
  getTrainerStatus,
  getTrainerCourses,
  createSession,
  getTrainerSessions,
  getSingleTrainerSession,
  updateTrainerSession,
  deleteTrainerSession,
  pauseSession,
  resumeSession,
  endSession,
  cancelTodaySession,
  uncancelTodaySession,
  endCourse,
  completeCourse,
  cancelCourse,
  requestDeleteSession,
} = require("../controllers/trainerSessionController");

const {
  getPaymentSummary,
  getPayoutBalance,
  getSessionEarnings,
  getSessionEarningDetail,
  getPayoutAccount,
  createPayoutAccount,
  updatePayoutAccount,
  getPayoutRequests,
  getPayoutRequestById,
  createPayoutRequest,
} = require("../controllers/trainerPaymentController");

const {
  getCourseAttendanceSummary,
  getSessionAttendance,
  getStudentAttendanceInCourse,
  getAttendanceEligibility
} = require("../controllers/trainerAttendanceController");

const {
  getTrainerTridinCourses,
  getTrainerCourseVideos,
  addTrainerCourseVideo,
  updateTrainerCourseVideo,
  deleteTrainerCourseVideo,
  setVideoAssessment,
  deleteVideoAssessment,
  getCourseCandidateAnalytics,
  updateCourseThumbnail,
  createTrainerTridinCourse,
  deleteTrainerTridinCourse,
} = require("../controllers/tridinLmsController");

const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");
const videoUpload = require("../middleware/videoUploadMiddleware");

// ── Protect all trainer routes ─────────────────
router.use(protect);

// ── Trainer Payouts & Earnings Endpoints (Mounted at top to prevent routing conflict) ──
router.get("/payment-summary", getPaymentSummary);
router.get("/payout-balance", getPayoutBalance);
router.get("/session-earnings", getSessionEarnings);
router.get("/session-earnings/:sessionId", getSessionEarningDetail);
router.get("/payout-account", getPayoutAccount);
router.post("/payout-account", createPayoutAccount);
router.patch("/payout-account", updatePayoutAccount);
router.get("/payout-requests", getPayoutRequests);
router.get("/payout-requests/:requestId", getPayoutRequestById);
router.post("/payout-requests", createPayoutRequest);

// ── Trainer Status Endpoint ────────────────────
router.get("/status", getTrainerStatus);

// ── Trainer Courses Endpoint ───────────────────
router.get("/courses", getTrainerCourses);

// ── Trainer Session Endpoints ──────────────────
// POST   /api/trainer/sessions             → Create a new live session
router.post("/sessions", upload.single("thumbnail"), createSession);

// GET    /api/trainer/sessions             → List all sessions for the logged-in trainer
router.get("/sessions", getTrainerSessions);

// GET    /api/trainer/my-sessions          → Alias for listing all sessions for the logged-in trainer
router.get("/my-sessions", getTrainerSessions);

// GET    /api/trainer/sessions/:sessionId  → Fetch a single session
router.get("/sessions/:sessionId", getSingleTrainerSession);

// PATCH  /api/trainer/sessions/:sessionId  → Partially update a session
router.patch("/sessions/:sessionId", upload.single("thumbnail"), updateTrainerSession);

// POST   /api/trainer/sessions/:sessionId/pause  → Pause the session
router.post("/sessions/:sessionId/pause", pauseSession);

// POST   /api/trainer/sessions/:sessionId/resume → Resume the session
router.post("/sessions/:sessionId/resume", resumeSession);

// POST   /api/trainer/sessions/:sessionId/end    → Permanently end the session
router.post("/sessions/:sessionId/end", endSession);

// POST   /api/trainer/sessions/:sessionId/request-delete → Request to delete the session
router.post("/sessions/:sessionId/request-delete", requestDeleteSession);

// POST   /api/trainer/sessions/:sessionId/cancel-today → Cancel the session for today
router.post("/sessions/:sessionId/cancel-today", cancelTodaySession);

// DELETE /api/trainer/sessions/:sessionId/cancel-today → Un-cancel today's session
router.delete("/sessions/:sessionId/cancel-today", uncancelTodaySession);

// DELETE /api/trainer/sessions/:sessionId  → Delete a session permanently
router.delete("/sessions/:sessionId", deleteTrainerSession);

// ── Trainer Course Management Endpoints ──────────────────
router.post("/courses/:courseId/end", endCourse);
router.post("/courses/:courseId/complete", completeCourse);
router.post("/courses/:courseId/cancel", cancelCourse);

// ── Trainer Attendance Endpoints ─────────────────────────
router.get("/courses/:courseId/attendance-summary", getCourseAttendanceSummary);
router.get("/sessions/:sessionId/attendance", getSessionAttendance);
router.get("/courses/:courseId/student-attendance", getStudentAttendanceInCourse);
router.get("/courses/:courseId/attendance-eligibility", getAttendanceEligibility);

// ── Trainer Tridin YouTube-style Video Playlist & Assessments ──
router.get("/tridin/courses", getTrainerTridinCourses);
router.get("/tridin/courses/:sessionId/videos", getTrainerCourseVideos);
// Accept both videoFile (direct upload) and thumbnail image
router.post(
  "/tridin/courses/:sessionId/videos",
  videoUpload.fields([
    { name: "videoFile", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  addTrainerCourseVideo
);
router.put(
  "/tridin/videos/:videoId",
  videoUpload.fields([
    { name: "videoFile", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  updateTrainerCourseVideo
);
router.delete("/tridin/videos/:videoId", deleteTrainerCourseVideo);
router.post("/tridin/videos/:videoId/assessment", setVideoAssessment);
router.delete("/tridin/videos/:videoId/assessment", deleteVideoAssessment);
router.get("/tridin/courses/:sessionId/candidate-progress", getCourseCandidateAnalytics);
router.patch(
  "/tridin/courses/:sessionId/thumbnail",
  upload.single("thumbnail"),
  updateCourseThumbnail
);
router.post(
  "/tridin/courses",
  upload.single("thumbnail"),
  createTrainerTridinCourse
);
router.delete("/tridin/courses/:sessionId", deleteTrainerTridinCourse);

module.exports = router;
