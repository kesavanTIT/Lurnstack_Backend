"use strict";

const trainerAttendanceService = require("../services/trainerAttendance.service");

/**
 * GET /api/v1/trainer/sessions
 * Returns all sessions assigned to the authenticated trainer.
 */
const getSessions = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const trainer = await trainerAttendanceService.findTrainerByUserId(userId);
    if (!trainer) {
      return res.status(403).json({
        success: false,
        message: "No trainer profile found for this account.",
      });
    }

    const sessions = await trainerAttendanceService.getTrainerSessions(trainer.id);

    return res.status(200).json({
      success: true,
      data: sessions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/trainer/attendance
 * Returns full attendance data (session info, summary cards, student list)
 * for a specific session on a specific date.
 *
 * Query params: sessionId (required), date (required, YYYY-MM-DD), status (optional)
 */
const getAttendance = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { sessionId, date, status } = req.query;

    // Validate required params
    if (!sessionId || !date) {
      return res.status(400).json({
        success: false,
        message: "sessionId and date (YYYY-MM-DD) are required query parameters.",
      });
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: "date must be in YYYY-MM-DD format.",
      });
    }

    // Validate status filter if provided
    if (status && !["present", "absent"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "status must be 'present' or 'absent'.",
      });
    }

    // Verify trainer identity
    const trainer = await trainerAttendanceService.findTrainerByUserId(userId);
    if (!trainer) {
      return res.status(403).json({
        success: false,
        message: "No trainer profile found for this account.",
      });
    }

    // Security check: session must belong to this trainer
    const sessionOwned = await trainerAttendanceService.verifySessionOwnership(
      sessionId,
      trainer.id
    );
    if (!sessionOwned) {
      return res.status(403).json({
        success: false,
        message: "Access denied. This session does not belong to you.",
      });
    }

    const data = await trainerAttendanceService.getAttendanceData(
      sessionId,
      date,
      status
    );

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/trainer/attendance/mark
 * Marks or updates a student's attendance for a specific occurrence.
 *
 * Body: { occurrenceId, studentId, joinTime, leaveTime }
 */
const markAttendance = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { occurrenceId, studentId, joinTime, leaveTime } = req.body;

    // Validate required fields
    if (!occurrenceId || !studentId) {
      return res.status(400).json({
        success: false,
        message: "occurrenceId and studentId are required.",
      });
    }

    // Verify trainer identity
    const trainer = await trainerAttendanceService.findTrainerByUserId(userId);
    if (!trainer) {
      return res.status(403).json({
        success: false,
        message: "No trainer profile found for this account.",
      });
    }

    const record = await trainerAttendanceService.markAttendance({
      occurrenceId,
      studentId,
      joinTime: joinTime || null,
      leaveTime: leaveTime || null,
    });

    return res.status(200).json({
      success: true,
      data: record,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * GET /api/v1/trainer/attendance/summary
 * Returns only summary cards (no student list) for a session on a date.
 *
 * Query params: sessionId (required), date (required, YYYY-MM-DD)
 */
const getAttendanceSummary = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { sessionId, date } = req.query;

    if (!sessionId || !date) {
      return res.status(400).json({
        success: false,
        message: "sessionId and date (YYYY-MM-DD) are required query parameters.",
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: "date must be in YYYY-MM-DD format.",
      });
    }

    const trainer = await trainerAttendanceService.findTrainerByUserId(userId);
    if (!trainer) {
      return res.status(403).json({
        success: false,
        message: "No trainer profile found for this account.",
      });
    }

    const sessionOwned = await trainerAttendanceService.verifySessionOwnership(
      sessionId,
      trainer.id
    );
    if (!sessionOwned) {
      return res.status(403).json({
        success: false,
        message: "Access denied. This session does not belong to you.",
      });
    }

    const summary = await trainerAttendanceService.getAttendanceSummary(sessionId, date);

    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSessions,
  getAttendance,
  markAttendance,
  getAttendanceSummary,
};
