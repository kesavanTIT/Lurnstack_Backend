const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  generateCertificate,
  downloadCertificate,
  purchaseCertificate,
  verifyCertificate,
  getCertificateSettings,
  getEligibleCourses,
  getAttendanceStats,
  getEligibilityStatus,
} = require("../controllers/certificateController");

// Public route for certificate verification
router.get("/verify/:certificateId", verifyCertificate);

// @route   GET /api/certificates/download/local/:blobName
// @desc    Download locally stored mock certificate (Public so browser can open it directly)
router.get("/download/local/:blobName", require("../controllers/certificateController").downloadLocalCertificate);

// All certificate routes require authentication
router.use(protect);

// @route   POST /api/certificates/generate
// @desc    Generate a certificate (idempotent — returns existing if found)
router.post("/generate", generateCertificate);

// @route   GET /api/certificates/:id/download
// @desc    Get a fresh signed download URL for an issued certificate
router.get("/:id/download", downloadCertificate);

// @route   POST /api/certificates/purchase
// @desc    Create a Razorpay order for a PAID certificate
router.post("/purchase", purchaseCertificate);

// @route   GET /api/certificates
// @desc    Get all certificates for the user or a specific one by courseId query
const { getMyCertificates } = require("../controllers/certificateController");
router.get("/", getMyCertificates);

// @route   GET /api/certificates/settings
// @desc    Get global certificate settings
router.get("/settings", getCertificateSettings);

// @route   GET /api/certificates/eligible-courses
// @desc    Get courses student is enrolled in or completed
router.get("/eligible-courses", getEligibleCourses);

// @route   GET /api/certificates/attendance/:courseId
// @desc    Get student attendance stats for a course
router.get("/attendance/:courseId", getAttendanceStats);

// @route   GET /api/certificates/eligibility/:courseId
// @desc    Get eligibility status for a course
router.get("/eligibility/:courseId", getEligibilityStatus);

module.exports = router;
