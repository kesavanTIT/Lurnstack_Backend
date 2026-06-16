const attendanceService = require('../services/attendance.service');

/**
 * GET /students/:studentId/attendance/overview
 *
 * Returns aggregated attendance statistics for a single student:
 * totalClasses, presentClasses, missedClasses, attendancePercentage.
 */
const getOverview = async (req, res, next) => {
  try {
    const { studentId } = req.params;

    // Validate ObjectId format
    if (!attendanceService.isValidObjectId(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID format',
      });
    }

    // Verify student exists
    const student = await attendanceService.findStudentById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    // Delegate to service layer
    const overview = await attendanceService.getAttendanceOverview(studentId);

    return res.status(200).json({
      success: true,
      data: overview,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /students/:studentId/attendance/history
 *
 * Returns paginated attendance history for a single student,
 * sorted by session date descending (newest first).
 *
 * Query params: page (default: 1), limit (default: 10)
 */
const getHistory = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { page, limit } = req.query;

    // Validate ObjectId format
    if (!attendanceService.isValidObjectId(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID format',
      });
    }

    // Verify student exists
    const student = await attendanceService.findStudentById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    // Delegate to service layer
    const result = await attendanceService.getAttendanceHistory(studentId, {
      page,
      limit,
    });

    return res.status(200).json({
      success: true,
      data: result.records,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOverview,
  getHistory,
};
