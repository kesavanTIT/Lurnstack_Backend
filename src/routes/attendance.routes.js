const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendance.controller');

/**
 * @route   GET /api/v1/students/:studentId/attendance/overview
 * @desc    Get attendance overview (total, present, missed, percentage)
 * @access  Public (add auth middleware as needed)
 */
router.get(
  '/students/:studentId/attendance/overview',
  attendanceController.getOverview
);

/**
 * @route   GET /api/v1/students/:studentId/attendance/history
 * @desc    Get paginated attendance history sorted newest-first
 * @query   page (default: 1), limit (default: 10)
 * @access  Public (add auth middleware as needed)
 */
router.get(
  '/students/:studentId/attendance/history',
  attendanceController.getHistory
);

module.exports = router;
