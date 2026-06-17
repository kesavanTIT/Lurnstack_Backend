"use strict";

const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const trainerAttendanceController = require("../controllers/trainerAttendance.controller");

/**
 * @route   GET /api/v1/trainer/sessions
 * @desc    Get all sessions assigned to the authenticated trainer
 * @access  Protected (JWT)
 */
router.get("/trainer/sessions", protect, trainerAttendanceController.getSessions);

/**
 * @route   GET /api/v1/trainer/attendance
 * @desc    Get full attendance data for a session on a specific date
 * @query   sessionId (required), date (required, YYYY-MM-DD), status (optional)
 * @access  Protected (JWT)
 */
router.get("/trainer/attendance", protect, trainerAttendanceController.getAttendance);

/**
 * @route   POST /api/v1/trainer/attendance/mark
 * @desc    Mark or update a student's attendance for a session occurrence
 * @body    { occurrenceId, studentId, joinTime, leaveTime }
 * @access  Protected (JWT)
 */
router.post("/trainer/attendance/mark", protect, trainerAttendanceController.markAttendance);

/**
 * @route   GET /api/v1/trainer/attendance/summary
 * @desc    Get attendance summary cards only (no student list)
 * @query   sessionId (required), date (required, YYYY-MM-DD)
 * @access  Protected (JWT)
 */
router.get("/trainer/attendance/summary", protect, trainerAttendanceController.getAttendanceSummary);

/**
 * @route   POST /api/v1/trainer/sessions/:sessionId/occurrences/:occurrenceId/extend
 * @desc    Extend the end time of a session occurrence
 * @body    { additionalMinutes }
 * @access  Protected (JWT)
 */
router.post("/trainer/sessions/:sessionId/occurrences/:occurrenceId/extend", protect, trainerAttendanceController.extendSessionOccurrence);

module.exports = router;
